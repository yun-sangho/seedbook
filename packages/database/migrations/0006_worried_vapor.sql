CREATE TABLE "seedbook"."StockQuote" (
	"market" text NOT NULL,
	"ticker" text NOT NULL,
	"price" bigint NOT NULL,
	"marketStatus" text NOT NULL,
	"tradedAt" timestamp (3) with time zone NOT NULL,
	"fetchedAt" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "StockQuote_pkey" PRIMARY KEY("market","ticker")
);
