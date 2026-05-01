# Hanna Backend

Backend services for **Hanna Care Intelligence**.

Hanna turns clinic visits into guided care.

> Hanna creates the documentation, care plan, LINE follow-up, and nurse priority list after each visit.

## Product role

The backend supports the shared care intelligence loop:

```text
Visit → Documentation → Care plan → LINE follow-up → Risk signal → Nurse priority → Outcome report
```

It should be treated as platform infrastructure, not a separate product.

## Core responsibilities

- authentication and user/session management
- clinical note and care plan storage
- AI generation orchestration
- LINE follow-up orchestration
- risk signal processing
- nurse dashboard APIs
- reporting data APIs
- audit-ready event logging

## Current business direction

Hanna is sold as **Care Intelligence**.

Scribe, LINE, dashboard, and reporting are components of one annual system.

| Package | Price | Purpose |
|---|---:|---|
| Hanna Pilot | ฿60,000/month for 90 days | Prove the care loop with one clinic or department |
| Hanna Care Intelligence | ฿85,000/month, billed annually | Annual department-level care intelligence system |
| Hanna Enterprise | From ฿250,000/month, annual only | Multi-department, hospital group, or payer rollout |

## Engineering standard

The backend should prioritize:

- reliability
- auditability
- simple APIs
- secure data handling
- tenant-safe architecture
- clear event history
- low-friction integration with Scribe, LINE, and dashboards

## Compliance posture

Hanna is supervised care infrastructure. AI drafts and organizes information; licensed care teams review, confirm, and act.

Do not describe the backend as enabling autonomous diagnosis or autonomous treatment.

## Development

```bash
npm install
npm run dev
```

Environment variables depend on the active deployment and may include database, auth, LINE, and AI provider credentials.

## Product rule

If an API does not support visit capture, care plan generation, LINE follow-up, nurse prioritization, reporting, or compliance, it should be questioned before being expanded.
