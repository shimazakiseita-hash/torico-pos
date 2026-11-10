/** db.test の同時注文テスト用：開始時刻まで待ってから注文を連続で作り、番号をJSONで出力する */
import { createOrder, openDb } from "../db";

const [file, countArg, startAtArg, nowIso] = process.argv.slice(2);
const db = openDb(file);
const now = new Date(nowIso);
const numbers: number[] = [];

while (Date.now() < Number(startAtArg)) {
  // 全プロセスがそろってから一斉に始める
}
for (let i = 0; i < Number(countArg); i++) {
  numbers.push(createOrder(db, [{ item: "momo", seasoning: "tare", qty: 1 }], 100, now).number);
}
db.close();
console.log(JSON.stringify(numbers));
