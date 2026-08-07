import { performance } from 'perf_hooks';

interface MetricRecord {
  stage: string;
  durationMs: number;
  jobsFetched?: number;
  jobsNormalized?: number;
  jobsDeduped?: number;
  jobsRanked?: number;
}

export class MetricsCollector {
  private records: MetricRecord[] = [];

  start() {
    this.records = [];
  }

  record(stage: string, fn: () => Promise<any>): Promise<any> {
    const start = performance.now();
    return fn().then((result) => {
      const end = performance.now();
      this.records.push({ stage, durationMs: end - start });
      return result;
    });
  }

  addCounts(stage: string, counts: Partial<MetricRecord>) {
    const rec = this.records.find((r) => r.stage === stage);
    if (rec) Object.assign(rec, counts);
    else this.records.push({ stage, durationMs: 0, ...counts });
  }

  getReport() {
    return this.records;
  }
}

export const metrics = new MetricsCollector();
