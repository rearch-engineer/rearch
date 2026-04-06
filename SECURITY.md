# Security Policy

ReArch is committed to maintaining the security and integrity of its codebase. We take a
transparent, proactive approach to identifying and addressing vulnerabilities across all
components of the project.

## Dependency Management

Dependencies are periodically reviewed and updated to incorporate the latest security patches
and bug fixes. In addition, **Dependabot** is enabled on this repository to automatically
detect outdated or vulnerable dependencies and open pull requests with version updates.

## Secret Leak Monitoring

GitHub secret scanning is enabled on this repository. This monitors commits and pull requests
for accidentally exposed credentials, API keys, tokens, and other sensitive data, helping
prevent leaks before they reach production.

## Code Review Process

All code changes undergo AI, static code analysis and human review before reaching users:

- **Development** — Changes merged into `main` are reviewed by maintainers before being
  accepted.
- **Production** — Releases are cut from tagged versions and are subject to an additional
  round of human review before publication.

## Static Analysis with CodeQL

Every change, pull request, and release must pass **CodeQL** analysis with a clean result.
CodeQL performs semantic code analysis to detect security vulnerabilities, bugs, and other
issues. No code is merged or released if CodeQL reports any findings.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly. Do not open a public
issue. Instead, contact the maintainers directly so the issue can be assessed and addressed
before disclosure.
