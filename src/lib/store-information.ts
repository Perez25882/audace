export type ApprovedInformation = {
  id: string;
  title: string;
  body: string | null;
};
// Populate only with founder-approved copy. Null entries are never presented as final policies.
export const storeInformation: readonly ApprovedInformation[] = [
  { id: "contact", title: "Contact and customer support", body: null },
  { id: "delivery", title: "Delivery", body: null },
  { id: "returns", title: "Returns and exchanges", body: null },
  { id: "privacy", title: "Privacy", body: null },
  { id: "terms", title: "Terms of purchase", body: null },
];
