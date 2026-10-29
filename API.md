# API guide

Base path: `/api/v1`. JSON content type. Private operations require `Authorization: Bearer <accessToken>`. POST trade/transfer/import endpoints additionally require `Idempotency-Key: <8-80 letters, digits, underscore or hyphen>`. Use a unique UUID per intended operation. For network/409 concurrency retries, keep the SAME body and key. A new key represents a new operation. If a key/body is already committed it returns the original result; changing the body with that key returns 409. Account/portfolio creation is not idempotent.

## Auth

- `POST /auth/register`: `{"email":"you@example.com","password":"A-long-password-123"}` -> 201, accessToken/tokenType/expiresIn/userId.
- `POST /auth/login`: same body -> 200.
- `GET /auth/me` -> userId and CUSTOMER role.
- `POST /auth/logout` -> 204; current token revoked.
- `GET /actuator/health` is outside `/api/v1` and is public.

Error JSON normally has an `error` message. 400 invalid request, 401 missing/expired/tampered token or failed login, 404 missing or other-owner private resource, 409 duplicate email/idempotency conflict/insufficient funds/concurrent update. The local app returns 201 for both a newly posted trade/transfer and its successful idempotent replay; compare returned IDs.

## Portfolio endpoints

- `GET /quotes`: base simulation quotes.
- `GET /portfolios`: caller's portfolios.
- `POST /portfolios`: `{"name":"Long term"}` -> 201, portfolio with INR 100,000 cash.
- `GET /portfolios/{id}`: dashboard with cash, holdings, equity, realized/unrealized profit and effective scenario quotes.
- `POST /portfolios/{id}/scenario`: `{"scenario":"UP10"}`; also BASE, DOWN10. Changes only this portfolio.
- `POST /portfolios/{id}/trades`: `{"symbol":"INFY","side":"BUY","quantity":2}` plus key. SELL supported; integer quantities 1-100000.
- `GET /portfolios/{id}/trades`: immutable trade history.
- `POST /portfolios/{id}/import`: `{"csv":"side,symbol,quantity\nBUY,INFY,2\nBUY,ITC,5"}` plus key. All rows execute in one database transaction; no quoted fields or extra columns supported.
- `GET /portfolios/{id}/export`: CSV trade history, authenticated.

Price scenarios are absolute relative to base prices, not compounding. Trades are valued at the current portfolio scenario. Weighted average cost retains six decimal places; displayed money is rounded to two. Allocation shows only invested assets and excludes cash.
