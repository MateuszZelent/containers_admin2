from caddy_api_client import CaddyAPIClient

# Initialize the client
client = CaddyAPIClient("http://host.docker.internal:2020")  # Default Caddy admin endpoint

# Add a domain with automatic TLS (Let's Encrypt/ZeroSSL) and www redirect
client.add_domain_with_auto_tls(
    domain="client1.orion.zfns.eu.org", target="localhost", target_port=8657
)
print(f"Successfully added domain client1.orion.zfns.eu.org with automatic TLS")

# Get and print the domain configuration
# config = client._make_request('GET', '/config/apps/http/servers/srv0/routes').json()
# print("\nDomain configuration:")
# print(config)
