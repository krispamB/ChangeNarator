# ChangeNarator

ChangeNarator turns GitHub pull-request context into a structured change analysis and audience-specific changelogs, then publishes the result.

## Language

**AI Provider**:
The user-selected AI backend that performs both change analysis and changelog generation for a run.
_Avoid_: Engine, model provider, analyzer

**CLI Provider**:
An AI Provider accessed through an authenticated command-line tool running in the checked-out repository.
_Avoid_: Local model, shell provider

**API Provider**:
An AI Provider accessed through a remote HTTP interface using PR metadata and available patches.
_Avoid_: Cloud provider, hosted model

**Legacy Pipeline**:
The compatibility path in which Bob performs change analysis and WatsonX generates the changelogs.
_Avoid_: Default provider, Bob provider

**Change Analysis**:
The provider-neutral structured account of a pull request’s change types, affected modules, breaking changes, and technical impact.
_Avoid_: Bob analysis, summary

**Audience Changelogs**:
The developer, product-manager, and end-user descriptions generated from a Change Analysis.
_Avoid_: Analysis, release
