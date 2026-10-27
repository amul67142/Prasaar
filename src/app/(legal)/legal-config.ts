// Fill these in before submitting the Meta / LinkedIn app reviews. The legal pages read them.
export const LEGAL = {
  /** TODO: the registered legal entity that operates Prasaar, once it exists. */
  company: process.env.NEXT_PUBLIC_COMPANY_NAME ?? "Prasaar",
  product: "Prasaar",
  /** TODO: final domain and inbox once bought (PRD open question). */
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "privacy@prasaar.example",
  /** DPDP Act: a named grievance officer. TODO: name the person. */
  grievanceOfficer: process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER ?? "Grievance Officer (name to be added)",
  address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS ?? "Registered office address to be added",
  updated: "24 October 2026",
};
