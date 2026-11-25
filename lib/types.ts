// A contribution as returned by the sources. `createdAt` is a Date for freshly
// fetched contributions and an ISO string for contributions read from JSON.
export interface Contribution {
  createdAt: Date | string;
  description: string;
  link: string;
  type: string;
  source: string;
  tags?: string[];
}

// A contribution freshly fetched from a source.
export interface FetchedContribution extends Contribution {
  createdAt: Date;
}
