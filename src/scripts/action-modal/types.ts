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
  office?: 'council-member' | 'mayor' | 'state-senator' | 'state-representative' | 'governor' | 'lt-governor';
  leadership?: 'chair' | 'vice-chair' | 'mayor-pro-tem' | null;
  seatClass?: 'numbered' | 'at-large' | 'unknown';
  seatLabel?: 'district' | 'ward' | 'seat' | null;
  seatId?: string | null;
  vacant?: boolean;
  seatSource?: 'source' | 'parsed-title' | 'inferred-registry' | 'manual';
  partisan?: boolean;
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
  seatId?: string | null;
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

export interface DistrictMatch {
  senate: string | null;
  house: string | null;
  county: string | null;
  countyDistrict: string | null;
  city: string | null;
  cityDistrict: string | null;
}

export interface ModalData {
  actionLetters: ActionLetter[];
  stateLegislators: StateLegislators;
  localCouncils: LocalCouncils;
  registry: Registry;
  cameraCounts: Record<string, number>;
}
