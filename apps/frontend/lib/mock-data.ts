// Temporary data source for domains without a real backend yet (Payments, Pickups, Quotes,
// Shipment Requests) — see lib/types/placeholder.ts. Every function here returns a Promise,
// mirroring the shape of a real apiClient.get() call, so pages built against these don't
// change shape when a real endpoint is wired in later — only the function body changes.

import type {
  PaymentRecord,
  PickupRecord,
  QuoteRequest,
  ShipmentRequest,
} from "./types/placeholder";

const MOCK_LATENCY_MS = 250;

function delayed<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_LATENCY_MS));
}

const MOCK_PAYMENTS: PaymentRecord[] = [
  {
    id: "pay_1",
    orderId: "NW-1042",
    customerName: "Ananya Rao",
    amount: 1450,
    currency: "INR",
    method: "UPI",
    status: "PAID",
    createdAt: "2026-07-20T09:12:00Z",
    paidAt: "2026-07-20T09:14:00Z",
  },
  {
    id: "pay_2",
    orderId: "NW-1043",
    customerName: "Vikram Shah",
    amount: 2200,
    currency: "INR",
    method: null,
    status: "PENDING",
    createdAt: "2026-07-21T11:30:00Z",
    paidAt: null,
  },
  {
    id: "pay_3",
    orderId: "NW-1039",
    customerName: "Fatima Sheikh",
    amount: 890,
    currency: "INR",
    method: "CASH",
    status: "PAID",
    createdAt: "2026-07-18T14:05:00Z",
    paidAt: "2026-07-18T16:40:00Z",
  },
  {
    id: "pay_4",
    orderId: "NW-1044",
    customerName: "Rohan Mehta",
    amount: 3100,
    currency: "INR",
    method: null,
    status: "PENDING",
    createdAt: "2026-07-22T08:02:00Z",
    paidAt: null,
  },
];

const MOCK_PICKUPS: PickupRecord[] = [
  {
    id: "pk_1",
    orderId: "NW-1044",
    customerName: "Rohan Mehta",
    address: "Flat 402, Lotus Residency, Hyderabad",
    date: "2026-07-22",
    timeSlot: "10:00 AM - 12:00 PM",
    status: "PENDING",
    assignedManagerEmail: null,
    weightVerifiedKg: null,
    notes: null,
  },
  {
    id: "pk_2",
    orderId: "NW-1043",
    customerName: "Vikram Shah",
    address: "B-12 Industrial Estate, Ahmedabad",
    date: "2026-07-22",
    timeSlot: "2:00 PM - 4:00 PM",
    status: "PENDING",
    assignedManagerEmail: null,
    weightVerifiedKg: null,
    notes: null,
  },
  {
    id: "pk_3",
    orderId: "NW-1039",
    customerName: "Fatima Sheikh",
    address: "12 MG Road, Bengaluru",
    date: "2026-07-18",
    timeSlot: "9:00 AM - 11:00 AM",
    status: "COMPLETED",
    assignedManagerEmail: "manager@nationwide.dev",
    weightVerifiedKg: 4.8,
    notes: "Verified weight matched invoice.",
  },
  {
    id: "pk_4",
    orderId: "NW-1035",
    customerName: "Priya Nair",
    address: "88 Marine Drive, Mumbai",
    date: "2026-07-19",
    timeSlot: "11:00 AM - 1:00 PM",
    status: "RESCHEDULED",
    assignedManagerEmail: "manager@nationwide.dev",
    weightVerifiedKg: null,
    notes: "Customer unavailable, rescheduled to next day.",
  },
];

const MOCK_QUOTES: QuoteRequest[] = [
  {
    id: "q_1",
    customerName: "Karan Malhotra",
    origin: "Delhi",
    destination: "Frankfurt, Germany",
    weightKg: 12,
    reviewReason: "OVERSIZED",
    status: "PENDING_REVIEW",
    quotedAmount: null,
    createdAt: "2026-07-21T10:00:00Z",
  },
  {
    id: "q_2",
    customerName: "Sneha Iyer",
    origin: "Chennai",
    destination: "Singapore",
    weightKg: 3,
    reviewReason: null,
    status: "APPROVED",
    quotedAmount: 4200,
    createdAt: "2026-07-19T09:00:00Z",
  },
  {
    id: "q_3",
    customerName: "Arjun Kapoor",
    origin: "Mumbai",
    destination: "Lagos, Nigeria",
    weightKg: 8,
    reviewReason: "RESTRICTED_DESTINATION",
    status: "PENDING_REVIEW",
    quotedAmount: null,
    createdAt: "2026-07-22T07:45:00Z",
  },
];

const MOCK_SHIPMENT_REQUESTS: ShipmentRequest[] = [
  {
    id: "sr_1",
    customerName: "Meera Pillai",
    requestedService: "International Priority",
    status: "NEW",
    createdAt: "2026-07-22T06:30:00Z",
  },
  {
    id: "sr_2",
    customerName: "Aditya Bhatt",
    requestedService: "Standard",
    status: "IN_REVIEW",
    createdAt: "2026-07-21T15:20:00Z",
  },
];

export function listMockPayments(): Promise<PaymentRecord[]> {
  return delayed(MOCK_PAYMENTS);
}

export function listMockPickups(): Promise<PickupRecord[]> {
  return delayed(MOCK_PICKUPS);
}

export function listMockQuotes(): Promise<QuoteRequest[]> {
  return delayed(MOCK_QUOTES);
}

export function listMockShipmentRequests(): Promise<ShipmentRequest[]> {
  return delayed(MOCK_SHIPMENT_REQUESTS);
}
