export interface CustomerDto {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  /** A business account: signs in and lands on the B2B portal. Set by admin invite only. */
  isB2b: boolean;
  /** Deactivated customers cannot sign in and are hidden from booking screens. */
  isActive: boolean;
  consentGivenAt: string; // ISO 8601
  consentSource: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
