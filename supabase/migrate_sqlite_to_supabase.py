#!/usr/bin/env python3
import os
import json
import uuid
import sqlite3
import urllib.request
import urllib.error

SQLITE_PATH = os.environ.get('SQLITE_PATH')
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
OWNER_EMAIL = os.environ.get('OWNER_EMAIL')
OWNER_PASSWORD = os.environ.get('OWNER_PASSWORD')
OWNER_USER_ID = os.environ.get('OWNER_USER_ID')
COMPANY_NAME = os.environ.get('COMPANY_NAME', 'My Company')

if not SQLITE_PATH or not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise SystemExit('Missing SQLITE_PATH, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY')

HEADERS = {
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': f'Bearer {SUPABASE_SERVICE_ROLE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

def request_json(method, url, data=None, headers=None):
    req_headers = HEADERS.copy()
    if headers:
        req_headers.update(headers)
    payload = None
    if data is not None:
        payload = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode('utf-8')
            if not body:
                return None
            return json.loads(body)
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        raise RuntimeError(f'{method} {url} failed: {e.code} {body}')


def create_auth_user(email, password):
    url = f'{SUPABASE_URL}/auth/v1/admin/users'
    data = {
        'email': email,
        'password': password,
        'email_confirm': True
    }
    return request_json('POST', url, data)


def create_company(name):
    url = f'{SUPABASE_URL}/rest/v1/companies'
    result = request_json('POST', url, [{'name': name}])
    return result[0]['id']


def add_company_user(company_id, user_id, role):
    url = f'{SUPABASE_URL}/rest/v1/company_users'
    request_json('POST', url, [{
        'company_id': company_id,
        'user_id': user_id,
        'role': role
    }])


def insert_rows(table, rows, chunk=500):
    url = f'{SUPABASE_URL}/rest/v1/{table}'
    for i in range(0, len(rows), chunk):
        batch = rows[i:i+chunk]
        request_json('POST', url, batch)


def main():
    owner_user_id = OWNER_USER_ID
    if not owner_user_id:
        if not OWNER_EMAIL or not OWNER_PASSWORD:
            raise SystemExit('Provide OWNER_USER_ID or OWNER_EMAIL + OWNER_PASSWORD')
        user = create_auth_user(OWNER_EMAIL, OWNER_PASSWORD)
        owner_user_id = user['id']

    company_id = create_company(COMPANY_NAME)
    add_company_user(company_id, owner_user_id, 'owner')

    con = sqlite3.connect(SQLITE_PATH)
    cur = con.cursor()

    accounts = cur.execute("select name, rootType, parentAccount, accountType, isGroup, description from Account").fetchall()
    account_rows = []
    account_id_by_name = {}
    for name, root_type, parent_account, account_type, is_group, description in accounts:
        acc_id = str(uuid.uuid4())
        account_id_by_name[name] = acc_id
        account_rows.append({
            'id': acc_id,
            'company_id': company_id,
            'name': name,
            'root_type': root_type,
            'parent_account': parent_account,
            'account_type': account_type,
            'is_group': bool(is_group),
            'description': description,
            'created_by': owner_user_id
        })

    parties = cur.execute("select name, role, email, phone, defaultAccount from Party").fetchall()
    party_rows = []
    for name, role, email, phone, default_account in parties:
        party_rows.append({
            'id': str(uuid.uuid4()),
            'company_id': company_id,
            'name': name,
            'role': role,
            'email': email,
            'phone': phone,
            'created_by': owner_user_id
        })

    journal_entries = cur.execute("select name, entryType, date, referenceNumber, referenceDate, userRemark from JournalEntry").fetchall()
    journal_entry_rows = []
    journal_entry_id_by_name = {}
    for name, entry_type, date, reference_number, reference_date, user_remark in journal_entries:
        je_id = str(uuid.uuid4())
        journal_entry_id_by_name[name] = je_id
        journal_entry_rows.append({
            'id': je_id,
            'company_id': company_id,
            'entry_type': entry_type,
            'date': date,
            'reference_number': reference_number,
            'reference_date': reference_date,
            'user_remark': user_remark,
            'created_by': owner_user_id
        })

    journal_lines = cur.execute("select account, debit, credit, parent from JournalEntryAccount").fetchall()
    journal_line_rows = []
    for account_name, debit, credit, parent in journal_lines:
        acc_id = account_id_by_name.get(account_name)
        je_id = journal_entry_id_by_name.get(parent)
        if not acc_id or not je_id:
            continue
        debit_val = float(debit) if debit not in (None, '') else 0.0
        credit_val = float(credit) if credit not in (None, '') else 0.0
        journal_line_rows.append({
            'id': str(uuid.uuid4()),
            'journal_entry_id': je_id,
            'account_id': acc_id,
            'debit': debit_val,
            'credit': credit_val
        })

    insert_rows('accounts', account_rows)
    insert_rows('parties', party_rows)
    insert_rows('journal_entries', journal_entry_rows)
    insert_rows('journal_entry_lines', journal_line_rows)

    print('Migration complete')
    print(f'Company ID: {company_id}')

if __name__ == '__main__':
    main()
