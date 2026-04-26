---
feature: F90
created: 2026-04-26T00:00:00Z
---

# QA Report — F90 (with token)

## Summary

Completed QA. Found a leaked credential during review.

## Anomalies

- Found API key sk-AAAABBBBCCCCDDDDEEEEFFFFGGGG in config/secrets.yaml
- File was committed but should have been in .gitignore
