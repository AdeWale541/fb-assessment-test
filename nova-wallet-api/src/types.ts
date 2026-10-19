export interface Wallet {
  id: string;
  balanceKobo: number;
  createdAt: string;
  dailyOutbound: {
    watDate: string; // YYYY-MM-DD in WAT (UTC+1), day the counter applies to
    totalKobo: number;
  };
}

export interface Transfer {
  id: string;
  fromWalletId: string;
  toWalletId: string;
  amountKobo: number;
  idempotencyKey: string;
  createdAt: string;
}

export interface IdempotencyRecord {
  key: string;
  requestHash: string;
  statusCode: number;
  responseBody: unknown;
  createdAt: string;
}

export interface Db {
  wallets: Record<string, Wallet>;
  transfers: Transfer[];
  idempotencyKeys: Record<string, IdempotencyRecord>;
}
