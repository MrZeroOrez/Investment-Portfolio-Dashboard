# Local acceptance checklist

## Common

1. Register a new user. Duplicate email must fail; wrong password must fail.
2. Refresh the page, sign in again, and verify your data persists.
3. Log out. Sign in with another user and verify private records are isolated.
4. Stop and restart the backend; sign in again and verify stored data remains.
5. Inspect Network: no private call should succeed without a bearer token.
6. Check desktop and narrow mobile viewport; table sections should scroll horizontally rather than force the entire page wide.

## Portfolio scenario

1. Create "Learning"; cash/equity begin at INR 100,000.
2. Buy 10 INFY at base price 1,600. Cash 84,000, holdings value 16,000.
3. Set +10% scenario. Equity 101,600; unrealized profit 1,600.
4. Sell 4 INFY at 1,760. Cash 91,040; realized profit 640; remaining unrealized profit 960.
5. Try selling 99 INFY; it must fail without changing anything.
6. Import CSV with a valid row then an invalid symbol. The entire batch must roll back.
7. Import valid rows, filter history and download CSV. Open it and compare totals.
8. Use two users; private portfolio IDs must return 404 to the other user.
