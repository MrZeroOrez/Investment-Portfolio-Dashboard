package com.chandramohan.banking.domain;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class PortfolioController {
  private final PortfolioService service;

  public PortfolioController(PortfolioService service) {
    this.service = service;
  }

  public record Name(@NotBlank @Size(max = 80) String name) {}

  public record Scenario(@NotBlank String scenario) {}

  public record Csv(@NotBlank @Size(max = 50000) String csv) {}

  @GetMapping("/quotes")
  public Object quotes() {
    return service.quotes();
  }

  @GetMapping("/portfolios")
  public Object list(@AuthenticationPrincipal Jwt jwt) {
    return service.list(jwt.getSubject());
  }

  @PostMapping("/portfolios")
  @ResponseStatus(HttpStatus.CREATED)
  public Object create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody Name body) {
    return service.create(jwt.getSubject(), body.name());
  }

  @GetMapping("/portfolios/{id}")
  public Object dashboard(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
    return service.dashboard(jwt.getSubject(), id.toString());
  }

  @PostMapping("/portfolios/{id}/scenario")
  public Object scenario(
      @AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody Scenario body) {
    return service.scenario(jwt.getSubject(), id.toString(), body.scenario());
  }

  @GetMapping("/portfolios/{id}/trades")
  public Object history(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
    return service.history(jwt.getSubject(), id.toString());
  }

  @PostMapping("/portfolios/{id}/trades")
  @ResponseStatus(HttpStatus.CREATED)
  public Object trade(
      @AuthenticationPrincipal Jwt jwt,
      @PathVariable UUID id,
      @RequestHeader("Idempotency-Key") String key,
      @RequestBody PortfolioService.Order order) {
    return service.trade(jwt.getSubject(), id.toString(), order, key);
  }

  @PostMapping("/portfolios/{id}/import")
  public Object importCsv(
      @AuthenticationPrincipal Jwt jwt,
      @PathVariable UUID id,
      @Valid @RequestBody Csv csv,
      @RequestHeader("Idempotency-Key") String key) {
    return service.importCsv(jwt.getSubject(), id.toString(), csv.csv(), key);
  }

  @GetMapping(value = "/portfolios/{id}/export", produces = "text/csv")
  public ResponseEntity<String> export(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
    var out = new StringBuilder("id,symbol,side,quantity,price,total,createdAt\n");
    for (var t : service.history(jwt.getSubject(), id.toString()))
      out.append(
              String.join(
                  ",",
                  t.id(),
                  t.symbol(),
                  t.side(),
                  "" + t.quantity(),
                  "" + t.price(),
                  "" + t.total(),
                  t.createdAt()))
          .append("\n");
    return ResponseEntity.ok()
        .header("Content-Disposition", "attachment; filename=trades.csv")
        .body(out.toString());
  }
}
