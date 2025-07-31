#!/usr/bin/env python3
"""
Skrypt do generowania klienta API na podstawie specyfikacji OpenAPI
"""

import requests
import json
import os
from pathlib import Path

def download_openapi_spec(base_url: str, output_file: str = "openapi.json"):
    """Pobiera specyfikację OpenAPI z serwera"""
    try:
        response = requests.get(f"{base_url}/api/v1/openapi.json")
        response.raise_for_status()
        
        spec = response.json()
        
        # Zapisz specyfikację do pliku
        with open(output_file, 'w') as f:
            json.dump(spec, f, indent=2)
        
        print(f"✅ Specyfikacja OpenAPI zapisana do: {output_file}")
        print(f"📊 Endpointy: {len(spec.get('paths', {}))}")
        print(f"🏷️  Modele: {len(spec.get('components', {}).get('schemas', {}))}")
        
        return spec
        
    except Exception as e:
        print(f"❌ Błąd pobierania specyfikacji: {e}")
        return None

def generate_python_client():
    """Generuje klienta Python używając openapi-generator"""
    print("\n🔧 Generowanie klienta Python...")
    
    # Sprawdź czy openapi-generator jest zainstalowany
    if os.system("which openapi-generator-cli > /dev/null 2>&1") != 0:
        print("⚠️  openapi-generator-cli nie jest zainstalowany")
        print("Zainstaluj: npm install -g @openapitools/openapi-generator-cli")
        return False
    
    # Generuj klienta
    cmd = """
    openapi-generator-cli generate \
        -i openapi.json \
        -g python \
        -o ./generated-client \
        --package-name containers_admin_client \
        --additional-properties=packageVersion=1.0.0
    """
    
    result = os.system(cmd)
    if result == 0:
        print("✅ Klient Python wygenerowany w ./generated-client/")
    else:
        print("❌ Błąd generowania klienta")
    
    return result == 0

def generate_typescript_client():
    """Generuje klienta TypeScript"""
    print("\n🔧 Generowanie klienta TypeScript...")
    
    cmd = """
    openapi-generator-cli generate \
        -i openapi.json \
        -g typescript-axios \
        -o ./generated-client-ts \
        --additional-properties=npmName=containers-admin-client,npmVersion=1.0.0
    """
    
    result = os.system(cmd)
    if result == 0:
        print("✅ Klient TypeScript wygenerowany w ./generated-client-ts/")
    else:
        print("❌ Błąd generowania klienta TypeScript")
    
    return result == 0

def show_available_endpoints(spec):
    """Pokazuje dostępne endpointy"""
    if not spec or 'paths' not in spec:
        return
    
    print("\n📋 Dostępne endpointy:")
    print("=" * 50)
    
    for path, methods in spec['paths'].items():
        for method, details in methods.items():
            if method.upper() in ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']:
                summary = details.get('summary', 'Brak opisu')
                tags = details.get('tags', [])
                tag_str = f"[{', '.join(tags)}]" if tags else ""
                
                print(f"{method.upper():6} {path:40} {tag_str}")
                print(f"       └─ {summary}")

def show_models(spec):
    """Pokazuje dostępne modele danych"""
    if not spec or 'components' not in spec or 'schemas' not in spec['components']:
        return
    
    print("\n🏷️  Dostępne modele danych:")
    print("=" * 50)
    
    for model_name, model_def in spec['components']['schemas'].items():
        model_type = model_def.get('type', 'object')
        title = model_def.get('title', model_name)
        description = model_def.get('description', '')
        
        print(f"📦 {model_name} ({model_type})")
        if description:
            print(f"   └─ {description}")
        
        # Pokaż właściwości jeśli to object
        if model_type == 'object' and 'properties' in model_def:
            props = list(model_def['properties'].keys())
            if len(props) <= 5:
                print(f"   └─ Właściwości: {', '.join(props)}")
            else:
                print(f"   └─ Właściwości ({len(props)}): {', '.join(props[:3])}...")

if __name__ == "__main__":
    print("🔄 Pobieranie specyfikacji OpenAPI...")
    
    # Pobierz specyfikację
    base_url = "http://localhost:8000"  # Można zmienić na zewnętrzny URL
    spec = download_openapi_spec(base_url)
    
    if spec:
        # Pokaż dostępne endpointy i modele
        show_available_endpoints(spec)
        show_models(spec)
        
        print("\n" + "=" * 60)
        print("🛠️  Dostępne opcje generowania klientów:")
        print("1. Python: python generate_client.py --python")
        print("2. TypeScript: python generate_client.py --typescript")
        print("3. Inne języki: sprawdź openapi-generator-cli")
        
        # Jeśli są argumenty, generuj klientów
        import sys
        if "--python" in sys.argv:
            generate_python_client()
        if "--typescript" in sys.argv:
            generate_typescript_client()
