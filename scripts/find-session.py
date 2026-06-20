#!/usr/bin/env python3
import os
import json
import glob
from datetime import datetime

BRAIN_DIR = os.path.expanduser("~/.gemini/antigravity-ide/brain")

def get_recent_sessions():
    if not os.path.exists(BRAIN_DIR):
        print(f"Error: Brain directory not found at {BRAIN_DIR}")
        return

    # Find all conversation directories (directories in brain folder)
    folders = []
    for entry in os.scandir(BRAIN_DIR):
        if entry.is_dir() and len(entry.name) == 36: # UUID length is 36
            folders.append(entry)

    # Sort folders by modification time (most recent first)
    folders.sort(key=lambda x: x.stat().st_mtime, reverse=True)

    print("\n======================================================================")
    print("                    FABLE AGENT CRASH RECOVERY                        ")
    print("======================================================================")
    print("If the IDE or application recently crashed, you can restore your chat ")
    print("history and coding context by mentioning the previous session ID.")
    print("Simply type '@' followed by the Session ID in the chat input. E.g.:")
    print("  @9df3ee15-525c-474f-9d6a-ef70a9840091")
    print("======================================================================")
    
    print("\n--- Recent Agent Sessions ---")
    for folder in folders[:5]:
        mtime = datetime.fromtimestamp(folder.stat().st_mtime).strftime('%Y-%m-%d %H:%M:%S')
        transcript_path = os.path.join(folder.path, ".system_generated", "logs", "transcript.jsonl")
        
        last_prompt = "No history found."
        if os.path.exists(transcript_path):
            try:
                with open(transcript_path, 'r') as f:
                    lines = f.readlines()
                    # Find the last USER_INPUT from the bottom of the transcript
                    for line in reversed(lines):
                        data = json.loads(line)
                        if data.get("type") == "USER_INPUT":
                            content = data.get("content", "")
                            # Clean up XML/meta tags for readable display
                            if "<USER_REQUEST>" in content:
                                content = content.split("<USER_REQUEST>")[1].split("</USER_REQUEST>")[0]
                            last_prompt = content.strip().replace("\n", " ")[:80]
                            break
            except Exception as e:
                last_prompt = f"Error reading transcript: {e}"

        print(f"\nID:   {folder.name}")
        print(f"Time: {mtime}")
        print(f"Last: {last_prompt}")
    
    print("\n----------------------------------------------------------------------")
    print("To restore a session, copy an ID above and type: @<Session_ID> in the chat.")
    print("----------------------------------------------------------------------\n")

if __name__ == "__main__":
    get_recent_sessions()
