// Ayrı İşçi Axını (Worker Thread) — Fayl emalının əsas HTTP serverini heç vaxt dondurmaması üçün
"use strict";

const { Worker, isMainThread, parentPort, workerData } = require("node:worker_threads");

if (!isMainThread) {
  // İşçi axın daxilində: parsers.faylEmalEt çağır və nəticəni geri göndər
  const parsers = require("./parsers");
  (async () => {
    try {
      const { base64Data, faylAdi, mimeType } = workerData;
      const buffer = Buffer.from(base64Data, "base64");
      const netice = await parsers.faylEmalEt({ buffer, faylAdi, mimeType });
      parentPort.postMessage({ ok: true, netice, olcu: buffer.length });
    } catch (err) {
      parentPort.postMessage({ ok: false, xeta: err.message || "Fayl oxunarkən xəta baş verdi." });
    }
  })();
} else {
  // Əsas axından çağırılan funksiya (Timeout qoruması ilə)
  function fayliWorkerIleEmalEt({ base64Data, faylAdi, mimeType = "" }, timeoutMs = 45000) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(__filename, {
        workerData: { base64Data, faylAdi, mimeType }
      });

      const timer = setTimeout(() => {
        worker.terminate();
        reject(new Error(`"${faylAdi}" faylının emalı çox çəkdi (${Math.round(timeoutMs / 1000)} san. limit aşdı). Fayl çox böyük və ya zədələnmiş ola bilər.`));
      }, timeoutMs);

      worker.on("message", msg => {
        clearTimeout(timer);
        if (msg.ok) {
          resolve({ emal: msg.netice, olcu: msg.olcu });
        } else {
          reject(new Error(msg.xeta));
        }
      });

      worker.on("error", err => {
        clearTimeout(timer);
        reject(err);
      });

      worker.on("exit", code => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`Fayl emalı gözlənilmədən dayandı (Kod: ${code})`));
        }
      });
    });
  }

  module.exports = { fayliWorkerIleEmalEt };
}
