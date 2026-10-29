package com.chandramohan.banking;

import static org.junit.jupiter.api.Assertions.*;

import com.chandramohan.banking.domain.*;
import java.math.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PortfolioTest extends HttpSupport {
  @Autowired PortfolioService s;

  PortfolioService.Order buy(int q) {
    return new PortfolioService.Order("INFY", "BUY", q);
  }

  @Test
  void buyScenarioSellCalculatesProfitAndBalances() {
    String u = owner(), p = s.create(u, "Retirement").id();
    s.trade(u, p, buy(10), "buy-test-1");
    var d = s.scenario(u, p, "UP10");
    eq("1600", d.unrealized());
    s.trade(u, p, new PortfolioService.Order("INFY", "SELL", 4), "sell-test-1");
    d = s.dashboard(u, p);
    eq("91040", d.portfolio().cash());
    eq("640", d.portfolio().realized());
    eq("960", d.unrealized());
    eq("101600", d.equity());
  }

  @Test
  void duplicateIsIdempotentAndChangedPayloadConflicts() {
    String u = owner(), p = s.create(u, "P").id();
    var a = s.trade(u, p, buy(1), "same-key-01");
    var b = s.trade(u, p, buy(1), "same-key-01");
    assertEquals(a.id(), b.id());
    assertEquals(1, s.history(u, p).size());
    assertThrows(Exception.class, () -> s.trade(u, p, buy(2), "same-key-01"));
  }

  @Test
  void cannotOverspendOrSellMissingHoldings() {
    String u = owner(), p = s.create(u, "P").id();
    assertThrows(Exception.class, () -> s.trade(u, p, buy(100), "overspend-1"));
    assertThrows(
        Exception.class,
        () -> s.trade(u, p, new PortfolioService.Order("INFY", "SELL", 1), "oversell-01"));
    eq("100000", s.dashboard(u, p).portfolio().cash());
    assertEquals(0, s.history(u, p).size());
  }

  @Test
  void csvIsAtomic() {
    String u = owner(), p = s.create(u, "P").id();
    assertThrows(
        Exception.class,
        () -> s.importCsv(u, p, "side,symbol,quantity\nBUY,INFY,1\nBUY,UNKNOWN,1", "csv-key-01"));
    assertTrue(s.history(u, p).isEmpty());
    eq("100000", s.dashboard(u, p).portfolio().cash());
    var ts = s.importCsv(u, p, "side,symbol,quantity\nBUY,INFY,1\nBUY,ITC,2", "csv-key-02");
    assertEquals(2, ts.size());
    assertEquals(
        2, s.importCsv(u, p, "side,symbol,quantity\nBUY,INFY,1\nBUY,ITC,2", "csv-key-02").size());
    assertEquals(2, s.history(u, p).size());
    eq("97560", s.dashboard(u, p).portfolio().cash());
  }

  @Test
  void concurrentOrdersCannotOverspend() throws Exception {
    String u = owner(), p = s.create(u, "P").id();
    var pool = Executors.newFixedThreadPool(4);
    try {
      var tasks = new ArrayList<Callable<Boolean>>();
      for (int i = 0; i < 10; i++) {
        String key = "concurrent-" + i;
        tasks.add(
            () -> {
              try {
                s.trade(u, p, buy(10), key);
                return true;
              } catch (Exception e) {
                return false;
              }
            });
      }
      int ok = 0;
      for (var f : pool.invokeAll(tasks)) if (f.get()) ok++;
      assertEquals(6, ok);
      eq("4000", s.dashboard(u, p).portfolio().cash());
      assertEquals(60, s.dashboard(u, p).holdings().get(0).quantity());
    } finally {
      pool.shutdownNow();
    }
  }

  @Test
  void apiOwnershipValidationAndExport() throws Exception {
    String a = register(email()), b = register(email());
    var create = call("POST", "/portfolios", "{\"name\":\"Private\"}", a, null);
    assertEquals(201, create.statusCode());
    String id = field(create.body(), "id");
    assertEquals(404, call("GET", "/portfolios/" + id, null, b, null).statusCode());
    assertFalse(call("GET", "/portfolios", null, b, null).body().contains(id));
    var t =
        call(
            "POST",
            "/portfolios/" + id + "/trades",
            "{\"symbol\":\"ITC\",\"side\":\"BUY\",\"quantity\":2}",
            a,
            "http-key-01");
    assertEquals(201, t.statusCode(), t.body());
    assertTrue(
        call("GET", "/portfolios/" + id + "/export", null, a, null).body().contains("ITC,BUY,2"));
    assertEquals(400, call("POST", "/portfolios", "{\"name\":\" \"}", a, null).statusCode());
  }
}
