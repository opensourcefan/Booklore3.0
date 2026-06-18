import sys
import os
from unittest.mock import MagicMock

# Mock modules that we don't have on the host
sys.modules['pytesseract'] = MagicMock()
sys.modules['numpy'] = MagicMock()
sys.modules['torch'] = MagicMock()
sys.modules['sentence_transformers'] = MagicMock()

# Add parent directory to sys.path so we can import app.py
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import _ensure_list_citations

def test_ensure_list_citations_removes_duplicate_in_non_list():
    results = [
        {"bookTitle": "100 All-Time Greatest Comics", "pageNumber": 161}
    ]
    # Original LLM response already has a citation in the middle, and is a non-list
    answer = (
        "Based on the provided Context, I would recommend \"Nextwave\" as a humorous comic series.\n\n"
        "[Source: 100 All-Time Greatest Comics, Page 161]\n\n"
        "This series is described as Marvel's funniest ever book."
    )
    
    processed = _ensure_list_citations(answer, results)
    
    # Check that it doesn't append another citation at the end because one was already present
    assert processed.count("[Source: 100 All-Time Greatest Comics, Page 161]") == 1
    assert not processed.endswith("[Source: 100 All-Time Greatest Comics, Page 161]")

def test_ensure_list_citations_appends_to_non_list_if_none_present():
    results = [
        {"bookTitle": "100 All-Time Greatest Comics", "pageNumber": 161}
    ]
    # Answer has no citation
    answer = (
        "Based on the provided Context, I would recommend \"Nextwave\" as a humorous comic series.\n\n"
        "This series is described as Marvel's funniest ever book."
    )
    
    processed = _ensure_list_citations(answer, results)
    
    # Should append a citation at the end
    assert processed.count("[Source: 100 All-Time Greatest Comics, Page 161]") == 1
    assert processed.strip().endswith("[Source: 100 All-Time Greatest Comics, Page 161]")

if __name__ == "__main__":
    test_ensure_list_citations_removes_duplicate_in_non_list()
    test_ensure_list_citations_appends_to_non_list_if_none_present()
    print("All assertions passed successfully!")

