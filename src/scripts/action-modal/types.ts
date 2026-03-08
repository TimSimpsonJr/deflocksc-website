export interface ActionLetter {
  divisionPattern: string;
  category: string;
  label: string;
  subject: string;
  body: string;
}

export interface StateLegislator {
  name: string;
  party?: string;
  email: string;
  phone?: string;
  photoUrl?: string;
  website?: string;
}

export interface StateLegislators {
  senate: Record<string, StateLegislator>;
  house: Record<string, StateLegislator>;
}

export interface CouncilMember {
  name: string;
  title: string;
  email?: string;
  phone?: string;
}

export interface Council {
  label: string;
  members: CouncilMember[];
}

export type LocalCouncils = Record<string, Council>;

export interface Jurisdiction {
  id: string;
  name: string;
  type: string;
  county: string;
  hasBoundary?: boolean;
  boundaryFile?: string;
  districts?: number;
  districtRange?: string;
}

export interface Registry {
  jurisdictions: Jurisdiction[];
}

export interface Rep {
  name: string;
  party?: string;
  office: string;
  email: string;
  phone?: string;
  photoUrl?: string;
  website?: string;
  isMatchedDistrict?: boolean;
}

export interface RepGroup {
  label: string;
  category: string;
  subject: string;
  body: string;
  reps: Rep[];
  countyKey?: string;
  cityKey?: string;
  matchedDistrict?: string | null;
}

export type { DistrictMatch } from '../../lib/district-matcher.js';

export interface ModalData {
  actionLetters: ActionLetter[];
  stateLegislators: StateLegislators;
  localCouncils: LocalCouncils;
  registry: Registry;
}
