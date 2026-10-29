CREATE TABLE IF NOT EXISTS app_users(id VARCHAR(36) PRIMARY KEY,email VARCHAR(254) NOT NULL UNIQUE,password_hash VARCHAR(100) NOT NULL);
CREATE TABLE IF NOT EXISTS portfolios(id VARCHAR(36) PRIMARY KEY,owner_id VARCHAR(36) NOT NULL REFERENCES app_users(id),name VARCHAR(80) NOT NULL,market_multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.00,cash DECIMAL(19,2) NOT NULL CHECK(cash>=0),realized DECIMAL(19,2) NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS portfolio_owner ON portfolios(owner_id);
CREATE TABLE IF NOT EXISTS holdings(portfolio_id VARCHAR(36) REFERENCES portfolios(id),symbol VARCHAR(20),quantity INTEGER NOT NULL CHECK(quantity>=0),average_cost DECIMAL(19,6) NOT NULL,PRIMARY KEY(portfolio_id,symbol));
CREATE TABLE IF NOT EXISTS trades(id VARCHAR(36) PRIMARY KEY,portfolio_id VARCHAR(36) NOT NULL REFERENCES portfolios(id),symbol VARCHAR(20) NOT NULL,side VARCHAR(4) NOT NULL,quantity INTEGER NOT NULL,price DECIMAL(19,2) NOT NULL,total DECIMAL(19,2) NOT NULL,created_at VARCHAR(40) NOT NULL);
CREATE INDEX IF NOT EXISTS trade_portfolio ON trades(portfolio_id,created_at);
CREATE TABLE IF NOT EXISTS requests(owner_id VARCHAR(36) REFERENCES app_users(id),request_key VARCHAR(80),fingerprint VARCHAR(500) NOT NULL,result_id VARCHAR(36) NOT NULL,PRIMARY KEY(owner_id,request_key));
CREATE TABLE IF NOT EXISTS imports(owner_id VARCHAR(36) REFERENCES app_users(id),request_key VARCHAR(80),csv_content VARCHAR(50100) NOT NULL,result_ids VARCHAR(4000) NOT NULL,PRIMARY KEY(owner_id,request_key));
