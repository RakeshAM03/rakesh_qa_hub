export type Team = { id: string; name: string; featureCount: number };
export type Feature = {
  id: string;
  name: string;
  teamId: string | null;
  createdAt: string;
  totalIssues: number;
  validIssues: number;
  percentValid: number | null;
};
export const NO_TEAM = "__none__";
