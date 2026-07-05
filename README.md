# Hanna Backend

Backend services for **Hanna Care Intelligence**, a healthcare AI system designed to turn clinical visits into structured documentation, patient-friendly care plans, follow-up workflows, and care-team visibility.

## Product role

The backend supports the shared Hanna care intelligence loop:

```text
Visit → Documentation → Care plan → Follow-up → Risk signal → Care-team priority → Outcome visibility
```

It should be treated as platform infrastructure, not a separate product.

## Core responsibilities

- authentication and user/session management
- structured clinical note and care-plan storage
- AI generation orchestration
- follow-up workflow orchestration
- risk signal processing
- dashboard APIs
- audit-ready event logging
- reporting data APIs

## Engineering priorities

The backend should prioritize:

- reliability
- auditability
- simple APIs
- secure data handling
- tenant-safe architecture
- clear event history
- low-friction integration with the broader Hanna platform

## Compliance posture

Hanna is supervised care infrastructure. AI drafts and organizes information; licensed care teams review, confirm, and act. The system should not be described as autonomous diagnosis or autonomous treatment.

## Development

```bash
npm install
npm run dev
```

Environment variables depend on the active deployment and may include database, authentication, messaging, and AI provider credentials.

## Portfolio note

This repository demonstrates backend thinking for a forward-deployed healthcare AI system: workflow decomposition, service boundaries, auditability, and pilot-ready infrastructure.
