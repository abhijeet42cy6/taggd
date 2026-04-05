# platform.html Parity Checklist

This checklist is the locked UI contract for exact parity implementation.

## Shell
- Sidebar sections in order: Overview, Operations, Analytics, Platform
- Sidebar labels: Executive Overview, Portfolio Intel, Clients, Requisitions, Finance Command, SLA Performance, Workforce Mgmt, Data Operations, Ingestion Center
- Topbar elements in order: title, breadcrumb context, chips, quality badge, search, export action
- Dark theme spacing, border opacity, and card radius match platform spec

## Executive Overview
- KPI ribbon has 7 cards with label/value/delta pattern
- Trend strip chart region exists
- Risk heatmap table present with client x domain severity
- Two bottom tables: interventions and outliers
- Row click opens client drawer

## Portfolio Intelligence
- Bubble chart block
- Stacked bar block
- Full-width portfolio score table with composite score

## Clients
- Client card grid
- Split identity warning banner (Honeywell style)
- Per-card mini stats and composite progress
- Card click opens client quick drawer

## Requisitions
- Funnel block with stage counts
- Ageing block + level distribution
- Dense requisition evidence table
- Row click opens requisition drawer with timeline and raw attributes

## Finance Command
- Duplicate warning banner
- KPI row for budget/actual/forecast/unbilled or equivalent
- Trend and bridge blocks
- Ledger table with duplicate flag surface
- Dedupe mode concept represented

## SLA Performance
- KPI row for met/not met/not reported/quality
- Matrix and trend sections
- Evidence table with status pills
- Metric details modal

## Workforce Management
- KPI row for ideal/actual/fill/gap
- Ideal vs actual block
- WL distribution / fill gauge block
- Benchmark evidence table

## Data Operations
- Critical alerts banner
- Health KPIs
- Duplicate detector table
- Identity mismatch block
- Ingestion audit table

## Ingestion Center
- Express and Pro upload controls
- Recent job list
- Agent output + validation summary + pre-commit action area

