import type {
  AdmissionLine,
  Major,
  ProvincialScoreLine,
  RankTable,
  University,
} from '../../domain/types';

/**
 * A data source ("network fetcher"). In v0 the only implementation is a mock that
 * returns realistic sample data; a real implementation would scrape/call the
 * official 考试院 / 阳光高考 endpoints. The pipeline depends only on this interface,
 * so swapping in a real source touches nothing downstream.
 */
export interface DataFetcher {
  readonly name: string;
  fetchProvincialLines(): Promise<ProvincialScoreLine[]>;
  fetchRankTables(): Promise<RankTable[]>;
  fetchUniversities(): Promise<University[]>;
  fetchMajors(): Promise<Major[]>;
  fetchAdmissionLines(): Promise<AdmissionLine[]>;
}
