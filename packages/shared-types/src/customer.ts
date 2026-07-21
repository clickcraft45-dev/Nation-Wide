export interface CustomerDto {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  consentGivenAt: string; // ISO 8601
  consentSource: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
