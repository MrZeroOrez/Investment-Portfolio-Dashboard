import { chromium } from "playwright";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? {
        executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const email = "e2e-" + Date.now() + "@example.test",
  password = "Test-password-123";
const url = process.env.E2E_BASE_URL || "http://127.0.0.1:5173";
async function waitIdle() {
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("button")].some((b) =>
        b.textContent.includes("Please wait"),
      ),
  );
}
async function register() {
  await page.goto(url);
  await page
    .getByRole("button", { name: "New here? Create an account" })
    .click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Register", exact: true }).click();
}
async function login() {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
async function status(text) {
  await page.getByRole("status").filter({ hasText: text }).waitFor();
}
async function stat(index, expected) {
  await page.waitForFunction(
    ({ index, expected }) =>
      document.querySelectorAll(".stat strong")[index]?.textContent ===
      expected,
    { index, expected },
  );
}
try {
  await register();
  await page.getByRole("heading", { name: "Portfolio overview" }).waitFor();
  await page.getByLabel("New portfolio", { exact: true }).fill("E2E portfolio");
  await page
    .getByRole("button", { name: "Create portfolio", exact: true })
    .click();
  await status("Portfolio created");
  await stat(1, "₹1,00,000.00");
  await page.getByLabel("Instrument", { exact: true }).selectOption("INFY");
  await page.getByLabel("Quantity", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Execute trade" }).click();
  await status("Trade executed");
  await stat(1, "₹84,000.00");
  await page
    .getByLabel("Market scenario", { exact: true })
    .selectOption("UP10");
  await status("Simulation market scenario changed");
  await stat(2, "₹1,600.00");
  await page.getByLabel("Side", { exact: true }).selectOption("SELL");
  await page.getByLabel("Quantity", { exact: true }).fill("4");
  await page.getByRole("button", { name: "Execute trade" }).click();
  await status("Trade executed");
  await stat(1, "₹91,040.00");
  await stat(3, "₹640.00");
  await page.getByLabel("Quantity", { exact: true }).fill("99");
  await page.getByRole("button", { name: "Execute trade" }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Insufficient holdings" })
    .waitFor();
  await stat(1, "₹91,040.00");
  await page
    .getByLabel("CSV content", { exact: true })
    .fill("side,symbol,quantity\nBUY,ITC,1\nBUY,UNKNOWN,1");
  await page
    .getByRole("button", { name: "Import orders", exact: true })
    .click();
  await page.getByRole("alert").filter({ hasText: "Unknown symbol" }).waitFor();
  await stat(1, "₹91,040.00");
  await page
    .getByLabel("CSV content", { exact: true })
    .fill("side,symbol,quantity\nBUY,ITC,1");
  await page
    .getByRole("button", { name: "Import orders", exact: true })
    .click();
  await status("CSV imported");
  await stat(1, "₹90,578.00");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const file = await download;
  assert.equal(file.suggestedFilename(), "trades.csv");
  await page.getByLabel("Filter by instrument or side").fill("INFY");
  assert.equal(
    await page.locator("table").nth(1).locator("tbody tr").count(),
    2,
  );
  await page.screenshot({
    path: process.env.E2E_SCREENSHOT || join(tmpdir(), "portfolio-e2e.png"),
    fullPage: true,
  });
  await page.reload();
  await login();
  await page.getByRole("heading", { name: "Portfolio overview" }).waitFor();
  await stat(1, "₹90,578.00");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "Mobile page overflow",
  );
  await page.getByRole("button", { name: "Log out" }).click();
  await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  console.log(
    "PASS: portfolio browser -> API -> SQL, buy/scenario/sell, invalid CSV rollback, valid import, export, filter, reload/login, logout, mobile layout.",
  );
  assert.deepEqual(errors, [], "No uncaught browser errors");
} catch (e) {
  await page.screenshot({
    path: join(tmpdir(), "failed-" + url.split(":").pop() + ".png"),
    fullPage: true,
  });
  console.error("Page text:", await page.locator("body").innerText());
  throw e;
} finally {
  await browser.close();
}
