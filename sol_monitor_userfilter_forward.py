import asyncio
import os
from datetime import datetime, timedelta, timezone
import re
from telethon import TelegramClient, events

# Telegram API credentials (reuse from eth_monitor.py)
api_id = '26373394'
api_hash = '45c5edf0039ffdd8efe7965189b42141'
phone_number = '+66642397038'

# List of group chat IDs (no more usernames)
GROUP_TARGETS = [
    -4945112939,  # numeric channel ID
]

# List of user IDs (ints) to monitor in those groups
USER_FILTER = [
    448480473,     # numeric user ID
]

# Chat IDs to forward into (must include the -100 prefix for supergroups)
FORWARD_TO = [7181780057]

# File to store detected SOL contracts
OUTPUT_FILE = 'sol_contracts.txt'

# SOL contract address pattern (Base58, 32-44 chars)
SOL_PATTERN = r'\b[1-9A-HJ-NP-Za-km-z]{32,44}\b'

# Pattern to match potential CAs with special characters (allowing 1-2 special chars within)
SOL_PATTERN_WITH_SPECIALS = r'[1-9A-HJ-NP-Za-km-z]{8,}[-_.\s]{1,2}[1-9A-HJ-NP-Za-km-z]{8,}(?:[-_.\s]{1,2}[1-9A-HJ-NP-Za-km-z]{8,})*'

# Pattern to find potential CA fragments (minimum 8 chars of valid Base58)
CA_FRAGMENT_PATTERN = r'[1-9A-HJ-NP-Za-km-z]{8,}'

def find_split_contracts(text):
    """
    Find contract addresses that are split into 2-3 parts across the text.
    Returns list of tuples: (reconstructed_address, fragments_used, was_split)
    """
    results = []
    
    # Find all potential CA fragments with their positions
    fragment_matches = [(m.group(), m.start()) for m in re.finditer(CA_FRAGMENT_PATTERN, text)]
    
    # Remove duplicates while preserving order and position
    unique_fragments = []
    seen_frags = set()
    for frag, pos in fragment_matches:
        if frag not in seen_frags:
            seen_frags.add(frag)
            unique_fragments.append((frag, pos))
    
    if len(unique_fragments) < 2:
        return results
    
    # Identify fragments that have "pump" in them or followed by "pumpfun" marker
    ending_fragments = set()
    for frag, pos in unique_fragments:
        # Check if fragment itself ends with "pump"
        if frag.lower().endswith('pump'):
            ending_fragments.add(frag)
        # Check text after fragment for pumpfun marker
        text_after = text[pos + len(frag):pos + len(frag) + 20].lower()
        if 'pumpfun' in text_after or 'pump.fun' in text_after or 'pump' in text_after:
            ending_fragments.add(frag)
    
    # Try combinations of 2 fragments (in order of appearance)
    for i in range(len(unique_fragments)):
        for j in range(len(unique_fragments)):
            if i == j:
                continue
            
            frag_i, pos_i = unique_fragments[i]
            frag_j, pos_j = unique_fragments[j]
            
            # If one fragment is marked as ending, it should go last
            if frag_i in ending_fragments and frag_j not in ending_fragments:
                combined = frag_j + frag_i
                fragments_info = f"{frag_j} + {frag_i}"
            elif frag_j in ending_fragments and frag_i not in ending_fragments:
                combined = frag_i + frag_j
                fragments_info = f"{frag_i} + {frag_j}"
            else:
                # No clear marker, use order of appearance in text
                if pos_i < pos_j:
                    combined = frag_i + frag_j
                    fragments_info = f"{frag_i} + {frag_j}"
                else:
                    continue  # Skip reverse order to avoid duplicates
            
            if re.match(r'^[1-9A-HJ-NP-Za-km-z]{32,44}$', combined):
                # Check if we already have this combination
                if not any(combined == r[0] for r in results):
                    results.append((combined, fragments_info, True))
    
    # Try combinations of 3 fragments (in order of appearance, with ending fragment last)
    for i in range(len(unique_fragments)):
        for j in range(len(unique_fragments)):
            for k in range(len(unique_fragments)):
                if i == j or i == k or j == k:
                    continue
                
                frag_i, pos_i = unique_fragments[i]
                frag_j, pos_j = unique_fragments[j]
                frag_k, pos_k = unique_fragments[k]
                
                # Prefer combinations where the ending fragment is last
                frags = [(frag_i, pos_i), (frag_j, pos_j), (frag_k, pos_k)]
                
                # If we have an ending fragment, put it last
                ending_in_set = [f for f, p in frags if f in ending_fragments]
                if ending_in_set:
                    # Sort: non-ending by position, then ending at the end
                    non_ending = sorted([(f, p) for f, p in frags if f not in ending_fragments], key=lambda x: x[1])
                    ending = [(f, p) for f, p in frags if f in ending_fragments]
                    ordered = non_ending + ending
                else:
                    # No ending marker, use order of appearance
                    ordered = sorted(frags, key=lambda x: x[1])
                
                combined = ordered[0][0] + ordered[1][0] + ordered[2][0]
                
                if re.match(r'^[1-9A-HJ-NP-Za-km-z]{32,44}$', combined):
                    fragments_info = f"{ordered[0][0]} + {ordered[1][0]} + {ordered[2][0]}"
                    # Check if we already have this combination
                    if not any(combined == r[0] for r in results):
                        results.append((combined, fragments_info, True))
    
    return results

def extract_contracts_from_text(text):
    """
    Extract contract addresses from text, including those obfuscated with special characters or split across text.
    Returns list of tuples: (cleaned_address, original_format, detection_type)
    detection_type: 'standard', 'obfuscated', or 'split'
    """
    results = []
    
    # First, find standard CAs without special characters
    standard_matches = re.findall(SOL_PATTERN, text)
    for match in standard_matches:
        results.append((match, match, 'standard'))
    
    # Then, find potential obfuscated CAs with special characters
    obfuscated_matches = re.findall(SOL_PATTERN_WITH_SPECIALS, text)
    for match in obfuscated_matches:
        # Remove special characters to get the cleaned address
        cleaned = re.sub(r'[-_.\s]', '', match)
        
        # Validate it looks like a proper SOL address after cleaning
        if re.match(r'^[1-9A-HJ-NP-Za-km-z]{32,44}$', cleaned):
            # Check if we already found this as a standard match
            if not any(cleaned == r[0] for r in results):
                results.append((cleaned, match, 'obfuscated'))
    
    # Finally, try to find split CAs (only if we haven't found standard ones)
    if len(results) == 0:
        split_matches = find_split_contracts(text)
        for combined, fragments_info, was_split in split_matches:
            if not any(combined == r[0] for r in results):
                results.append((combined, fragments_info, 'split'))
    
    # Remove duplicates while preserving order
    seen = set()
    unique_results = []
    for cleaned, original, detection_type in results:
        if cleaned not in seen:
            seen.add(cleaned)
            unique_results.append((cleaned, original, detection_type))
    
    return unique_results

async def main():
    client = TelegramClient('session', api_id, api_hash)
    await client.start(phone=phone_number)
    print('Connected to Telegram')
    # Keep-alive: ping every 60 seconds to prevent inactivity disconnect
    async def keep_alive():
        while True:
            try:
                await client.get_me()
                # heartbeat log
                now = datetime.now(timezone.utc)
                print(f"Heartbeat at {now.isoformat()}")
            except Exception:
                # log any heartbeat errors
                print(f"Heartbeat check failed at {datetime.now(timezone.utc).isoformat()}")
            await asyncio.sleep(60)
    asyncio.create_task(keep_alive())

    # Seed seen addresses from last 30 days
    seen = set()
    # Load previously detected contracts to blacklist across restarts
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE) as f:
            for line in f:
                contract = line.strip().split()[0]
                seen.add(contract)
        print(f"Loaded {len(seen)} blacklisted contracts from {OUTPUT_FILE}")
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    print("Seeding existing SOL contracts from last 30 days...")
    for chat in GROUP_TARGETS:
        async for msg in client.iter_messages(chat, limit=None):
            if msg.date < cutoff:
                break
            text = msg.raw_text or ''
            text_clean = re.sub(r'https?://\S+', '', text)
            contract_results = extract_contracts_from_text(text_clean)
            for cleaned_addr, _, _ in contract_results:
                seen.add(cleaned_addr)
    print(f"Seeded {len(seen)} existing SOL contracts.")

    @client.on(events.NewMessage(chats=GROUP_TARGETS))
    async def handler(event):
        sender = await event.get_sender()
        sender_id = sender.id
        sender_username = sender.username
        # apply filter if USER_FILTER contains entries
        if USER_FILTER:
            if sender_id not in USER_FILTER and (not sender_username or sender_username not in USER_FILTER):
                return
        sender_key = sender_username if sender_username else sender_id
        text = event.raw_text or ''
        # Remove URLs to avoid matching addresses within links
        text_clean = re.sub(r'https?://\S+', '', text)
        # Extract contract addresses (including obfuscated ones)
        contract_results = extract_contracts_from_text(text_clean)
        
        if contract_results:
            with open(OUTPUT_FILE, 'a') as f:
                for cleaned_contract, original_format, detection_type in contract_results:
                    if cleaned_contract in seen:
                        continue
                    seen.add(cleaned_contract)
                    
                    # Add detection type flag to output
                    type_flag = ""
                    original_info = ""
                    if detection_type == 'obfuscated':
                        type_flag = " [OBFUSCATED]"
                        original_info = f" (original: {original_format})"
                    elif detection_type == 'split':
                        type_flag = " [SPLIT]"
                        original_info = f" (fragments: {original_format})"
                    
                    line = f"{cleaned_contract}\tfrom: {event.chat_id}\tby: {sender_key}\tmsg_id: {event.id}{type_flag}{original_info}\n"
                    f.write(line)
                    print(f"Captured SOL contract: {line.strip()}")
                    
                    # Forward CA to target chat
                    try:
                        for target in FORWARD_TO:
                            await client.send_message(target, cleaned_contract)
                            print(f"Forwarded CA {cleaned_contract} to {target}")
                    except Exception as e:
                        print(f"Failed to forward CA {cleaned_contract} to any targets {FORWARD_TO}: {e}")

    print(f"Monitoring for SOL contracts in: {GROUP_TARGETS}, from users: {USER_FILTER}")
    print(f"Will forward detected contracts to: {FORWARD_TO}")
    await client.run_until_disconnected()

if __name__ == '__main__':
    asyncio.run(main())
