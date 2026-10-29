package com.chandramohan.banking.domain;

import static com.chandramohan.banking.domain.Support.*;

import java.math.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PortfolioService {
  public record Quote(String symbol, String company, BigDecimal price) {}

  public record Portfolio(
      String id, String name, BigDecimal cash, BigDecimal realized, BigDecimal multiplier) {}

  public record Holding(
      String symbol,
      int quantity,
      BigDecimal averageCost,
      BigDecimal price,
      BigDecimal marketValue,
      BigDecimal unrealized) {}

  public record Dashboard(
      Portfolio portfolio,
      List<Holding> holdings,
      BigDecimal marketValue,
      BigDecimal equity,
      BigDecimal unrealized,
      BigDecimal totalProfit,
      List<Quote> quotes) {}

  public record Trade(
      String id,
      String symbol,
      String side,
      int quantity,
      BigDecimal price,
      BigDecimal total,
      String createdAt) {}

  public record Order(String symbol, String side, int quantity) {}

  private final JdbcTemplate db;
  private final List<Quote> quotes =
      List.of(
          new Quote("TCS", "Tata Consultancy Services", new BigDecimal("3500.00")),
          new Quote("INFY", "Infosys", new BigDecimal("1600.00")),
          new Quote("HDFCBANK", "HDFC Bank", new BigDecimal("1700.00")),
          new Quote("RELIANCE", "Reliance Industries", new BigDecimal("1400.00")),
          new Quote("ITC", "ITC", new BigDecimal("420.00")));

  public PortfolioService(JdbcTemplate db) {
    this.db = db;
  }

  public List<Quote> quotes() {
    return quotes;
  }

  public List<Portfolio> list(String owner) {
    return db.query(
        "SELECT * FROM portfolios WHERE owner_id=? ORDER BY name,id",
        (r, n) ->
            new Portfolio(
                r.getString("id"),
                r.getString("name"),
                r.getBigDecimal("cash"),
                r.getBigDecimal("realized"),
                r.getBigDecimal("market_multiplier")),
        owner);
  }

  @Transactional
  public Portfolio create(String owner, String name) {
    String id = id();
    db.update(
        "INSERT INTO portfolios(id,owner_id,name,cash,realized) VALUES(?,?,?,100000,0)",
        id,
        owner,
        name.strip());
    return owned(owner, id, false);
  }

  private Portfolio owned(String owner, String id, boolean lock) {
    return db
        .query(
            "SELECT * FROM portfolios WHERE id=? AND owner_id=?" + (lock ? " FOR UPDATE" : ""),
            (r, n) ->
                new Portfolio(
                    r.getString("id"),
                    r.getString("name"),
                    r.getBigDecimal("cash"),
                    r.getBigDecimal("realized"),
                    r.getBigDecimal("market_multiplier")),
            id,
            owner)
        .stream()
        .findFirst()
        .orElseThrow(Support::missing);
  }

  // Lock the aggregate also during reads so cash and holdings form one consistent snapshot.
  @Transactional
  public Dashboard dashboard(String owner, String id) {
    var p = owned(owner, id, true);
    var hs =
        db.query(
            "SELECT * FROM holdings WHERE portfolio_id=? AND quantity>0 ORDER BY symbol",
            (r, n) -> {
              String symbol = r.getString("symbol");
              int q = r.getInt("quantity");
              var avg = r.getBigDecimal("average_cost");
              var price = money(quote(symbol).price().multiply(p.multiplier()));
              return new Holding(
                  symbol,
                  q,
                  avg,
                  price,
                  money(price.multiply(BigDecimal.valueOf(q))),
                  money(price.subtract(avg).multiply(BigDecimal.valueOf(q))));
            },
            id);
    var mv = hs.stream().map(Holding::marketValue).reduce(BigDecimal.ZERO, BigDecimal::add);
    var unreal = hs.stream().map(Holding::unrealized).reduce(BigDecimal.ZERO, BigDecimal::add);
    return new Dashboard(
        p,
        hs,
        money(mv),
        money(p.cash().add(mv)),
        money(unreal),
        money(unreal.add(p.realized())),
        quotes.stream()
            .map(q -> new Quote(q.symbol(), q.company(), money(q.price().multiply(p.multiplier()))))
            .toList());
  }

  @Transactional
  public Dashboard scenario(String owner, String id, String scenario) {
    BigDecimal factor =
        switch (scenario) {
          case "BASE" -> new BigDecimal("1.00");
          case "UP10" -> new BigDecimal("1.10");
          case "DOWN10" -> new BigDecimal("0.90");
          default -> throw bad("Use BASE, UP10 or DOWN10");
        };
    owned(owner, id, true);
    db.update("UPDATE portfolios SET market_multiplier=? WHERE id=?", factor, id);
    return dashboard(owner, id);
  }

  public List<Trade> history(String owner, String id) {
    owned(owner, id, false);
    return db.query(
        "SELECT * FROM trades WHERE portfolio_id=? ORDER BY created_at DESC,id",
        (r, n) ->
            new Trade(
                r.getString("id"),
                r.getString("symbol"),
                r.getString("side"),
                r.getInt("quantity"),
                r.getBigDecimal("price"),
                r.getBigDecimal("total"),
                r.getString("created_at")),
        id);
  }

  private Quote quote(String symbol) {
    return quotes.stream()
        .filter(q -> q.symbol().equals(symbol))
        .findFirst()
        .orElseThrow(() -> bad("Unknown symbol"));
  }

  @Transactional
  public Trade trade(String owner, String portfolio, Order order, String key) {
    if (key == null || !key.matches("[A-Za-z0-9_-]{8,80}"))
      throw bad("Use an 8-80 character request key");
    validate(order);
    // Serialize same-user idempotency checks in the DB, not in JVM memory.
    db.queryForObject("SELECT id FROM app_users WHERE id=? FOR UPDATE", String.class, owner);
    String fingerprint =
        portfolio + ":" + order.symbol() + ":" + order.side() + ":" + order.quantity();
    var previous =
        db.queryForList(
            "SELECT fingerprint,result_id FROM requests WHERE owner_id=? AND request_key=?",
            owner,
            key);
    if (!previous.isEmpty()) {
      if (!fingerprint.equals(previous.get(0).get("FINGERPRINT"))
          && !fingerprint.equals(previous.get(0).get("fingerprint")))
        throw conflict("Request key already used with a different order");
      String result =
          Objects.toString(
              previous.get(0).getOrDefault("RESULT_ID", previous.get(0).get("result_id")));
      return history(owner, portfolio).stream()
          .filter(t -> t.id().equals(result))
          .findFirst()
          .orElseThrow();
    }
    Trade result = execute(owner, portfolio, order);
    db.update(
        "INSERT INTO requests(owner_id,request_key,fingerprint,result_id) VALUES(?,?,?,?)",
        owner,
        key,
        fingerprint,
        result.id());
    return result;
  }

  private void validate(Order o) {
    if (o == null
        || o.symbol() == null
        || o.side() == null
        || o.quantity() < 1
        || o.quantity() > 100000
        || !Set.of("BUY", "SELL").contains(o.side()))
      throw bad("Use BUY or SELL, known symbol, and quantity 1-100000");
    quote(o.symbol());
  }

  private Trade execute(String owner, String portfolio, Order o) {
    validate(o);
    var p = owned(owner, portfolio, true);
    var price = money(quote(o.symbol()).price().multiply(p.multiplier()));
    var total = money(price.multiply(BigDecimal.valueOf(o.quantity())));
    var rows =
        db.query(
            "SELECT quantity,average_cost FROM holdings WHERE portfolio_id=? AND symbol=?",
            (r, n) -> new Object[] {r.getInt(1), r.getBigDecimal(2)},
            portfolio,
            o.symbol());
    int quantity = rows.isEmpty() ? 0 : (Integer) rows.get(0)[0];
    var avg = rows.isEmpty() ? BigDecimal.ZERO : (BigDecimal) rows.get(0)[1];
    BigDecimal cash, realized = p.realized();
    int next;
    if (o.side().equals("BUY")) {
      if (p.cash().compareTo(total) < 0) throw conflict("Insufficient demo cash");
      next = quantity + o.quantity();
      avg =
          avg.multiply(BigDecimal.valueOf(quantity))
              .add(total)
              .divide(BigDecimal.valueOf(next), 6, RoundingMode.HALF_UP);
      cash = p.cash().subtract(total);
    } else {
      if (quantity < o.quantity()) throw conflict("Insufficient holdings");
      next = quantity - o.quantity();
      cash = p.cash().add(total);
      realized =
          money(realized.add(price.subtract(avg).multiply(BigDecimal.valueOf(o.quantity()))));
      if (next == 0) avg = BigDecimal.ZERO;
    }
    db.update("UPDATE portfolios SET cash=?,realized=? WHERE id=?", cash, realized, portfolio);
    if (rows.isEmpty())
      db.update(
          "INSERT INTO holdings(portfolio_id,symbol,quantity,average_cost) VALUES(?,?,?,?)",
          portfolio,
          o.symbol(),
          next,
          avg);
    else
      db.update(
          "UPDATE holdings SET quantity=?,average_cost=? WHERE portfolio_id=? AND symbol=?",
          next,
          avg,
          portfolio,
          o.symbol());
    var t = new Trade(id(), o.symbol(), o.side(), o.quantity(), price, total, now());
    db.update(
        "INSERT INTO trades(id,portfolio_id,symbol,side,quantity,price,total,created_at)"
            + " VALUES(?,?,?,?,?,?,?,?)",
        t.id(),
        portfolio,
        t.symbol(),
        t.side(),
        t.quantity(),
        t.price(),
        t.total(),
        t.createdAt());
    db.update("INSERT INTO event_outbox(id,resource_id,event_type,sent) VALUES(?,?,?,FALSE)",id(),t.id(),"TRADE_EXECUTED");
    return t;
  }

  // An import is one atomic transaction: any invalid row rolls back all earlier rows.
  @Transactional
  public List<Trade> importCsv(String owner, String portfolio, String csv, String key) {
    if (key == null || !key.matches("[A-Za-z0-9_-]{8,80}"))
      throw bad("Use an 8-80 character import key");
    if (csv == null || csv.length() > 50000) throw bad("CSV must be at most 50KB");
    String[] lines = csv.strip().split("\\R");
    if (lines.length < 2 || lines.length > 101 || !lines[0].strip().equals("side,symbol,quantity"))
      throw bad("Header side,symbol,quantity; 1-100 data rows");
    db.queryForObject("SELECT id FROM app_users WHERE id=? FOR UPDATE", String.class, owner);
    owned(owner, portfolio, true);
    var prior =
        db.query(
            "SELECT csv_content,result_ids FROM imports WHERE owner_id=? AND request_key=?",
            (r, n) -> new String[] {r.getString(1), r.getString(2)},
            owner,
            key);
    if (!prior.isEmpty()) {
      if (!prior.get(0)[0].equals(portfolio + "\n" + csv))
        throw conflict("Import key already used for different CSV");
      var ids = Set.of(prior.get(0)[1].split(","));
      return history(owner, portfolio).stream().filter(t -> ids.contains(t.id())).toList();
    }
    List<Trade> result = new ArrayList<>();
    for (int i = 1; i < lines.length; i++) {
      String[] cols = lines[i].split(",", -1);
      if (cols.length != 3) throw bad("Invalid CSV row " + (i + 1));
      int q;
      try {
        q = Integer.parseInt(cols[2].strip());
      } catch (NumberFormatException e) {
        throw bad("Invalid quantity on row " + (i + 1));
      }
      result.add(execute(owner, portfolio, new Order(cols[1].strip(), cols[0].strip(), q)));
    }
    db.update(
        "INSERT INTO imports(owner_id,request_key,csv_content,result_ids) VALUES(?,?,?,?)",
        owner,
        key,
        portfolio + "\n" + csv,
        String.join(",", result.stream().map(Trade::id).toList()));
    return result;
  }
}
