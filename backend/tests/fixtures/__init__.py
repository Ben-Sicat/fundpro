"""Synthetic xlsx fixtures reproducing every trap found in the real files.

The client's real workbooks contain donor PII and can never enter git
(RA 10173), so the parser is tested against files generated here instead.
Each trap is traceable to docs/FINDINGS.md §2.
"""
