/** `sql.js` 의 쓰는 부분만 (공식 타입 패키지를 들이지 않는다). */
declare module "sql.js/dist/sql-wasm-inline.js" {
  type BindValue = string | number | null | Uint8Array;

  interface Statement {
    bind(values?: BindValue[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, string | number | null | Uint8Array>;
    run(values?: BindValue[]): void;
    free(): boolean;
  }

  interface Database {
    exec(sql: string): unknown;
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database;
  }

  const initSqlJs: (config?: Record<string, unknown>) => Promise<SqlJsStatic>;
  export default initSqlJs;
}
