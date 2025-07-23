import requests
import json
from typing import Dict, Any, List, Optional
from app.core.logging import logger


class CaddyAPIClient:
    """
    Client for interacting with the Caddy API to manage domains and reverse proxies.
    """

    def __init__(self, api_url: str = "http://host.docker.internal:2020"):
        """Initialize the Caddy API client.

        Args:
            api_url: The URL of the Caddy API endpoint, defaults to http://host.docker.internal:2020
        """
        self.api_url = api_url
        self.headers = {"Content-Type": "application/json"}

    def add_domain_with_auto_tls(
        self, domain: str, target: str, target_port: int, handle_websockets: bool = True
    ) -> bool:
        """Add a domain with automatic TLS and reverse proxy to a target service.

        Args:
            domain: The domain name to configure
            target: The target hostname to proxy to (usually localhost)
            target_port: The port on the target to proxy to
            handle_websockets: Whether to handle WebSocket connections

        Returns:
            bool: True if the operation was successful, False otherwise
        """
        try:
            # Prepare route configuration for the domain
            config = {
                "match": [{"host": [domain]}],
                "handle": [{"handler": "subroute", "routes": []}],
                "terminal": True,
            }

            routes = config["handle"][0]["routes"]

            # Add root path configuration
            routes.append({"handle": [{"handler": "vars", "root": "/srv/www"}]})

            # Add WebSocket handling if requested
            if handle_websockets:
                routes.append(
                    {
                        "match": [
                            {
                                "header": {
                                    "Connection": ["*Upgrade*"],
                                    "Upgrade": ["websocket"],
                                }
                            }
                        ],
                        "handle": [
                            {
                                "handler": "reverse_proxy",
                                "upstreams": [{"dial": f"{target}:{target_port}"}],
                            }
                        ],
                    }
                )

            # Add standard HTTP handling
            routes.append(
                {
                    "handle": [
                        {
                            "handler": "reverse_proxy",
                            "upstreams": [{"dial": f"{target}:{target_port}"}],
                        }
                    ]
                }
            )

            # Add the route using PATCH (adds to existing routes)
            response = requests.patch(
                f"{self.api_url}/config/",
                headers=self.headers,
                data=json.dumps(
                    {"apps": {"http": {"servers": {"srv0": {"routes": [config]}}}}}
                ),
            )

            if response.status_code != 200:
                logger.error(
                    f"Failed to add route for {domain}: {response.status_code} - {response.text}"
                )
                return False

            # Add domain to TLS subjects for automatic certificate
            tls_response = requests.get(
                f"{self.api_url}/config/apps/tls/automation/policies/0/subjects"
            )
            if tls_response.status_code == 200:
                subjects = tls_response.json()
                if domain not in subjects:
                    subjects.append(domain)
                    tls_update = requests.patch(
                        f"{self.api_url}/config/apps/tls/automation/policies/0/subjects",
                        headers=self.headers,
                        data=json.dumps(subjects),
                    )
                    if tls_update.status_code != 200:
                        logger.error(
                            f"Failed to add {domain} to TLS subjects: {tls_update.status_code} - {tls_update.text}"
                        )
                        return False
            else:
                logger.error(
                    f"Failed to get TLS subjects: {tls_response.status_code} - {tls_response.text}"
                )
                return False

            logger.info(
                f"Successfully configured domain {domain} with TLS and reverse proxy to {target}:{target_port}"
            )
            return True

        except Exception as e:
            logger.error(f"Error configuring Caddy for domain {domain}: {str(e)}")
            return False

    def remove_domain(self, domain: str) -> bool:
        """Remove a domain configuration from Caddy.

        Args:
            domain: The domain name to remove

        Returns:
            bool: True if the operation was successful, False otherwise
        """
        try:
            # Get current routes
            response = requests.get(
                f"{self.api_url}/config/apps/http/servers/srv0/routes"
            )
            if response.status_code != 200:
                logger.error(
                    f"Failed to get routes: {response.status_code} - {response.text}"
                )
                return False

            current_routes = response.json()
            new_routes = []

            # Filter out the route for the given domain
            for route in current_routes:
                if "match" in route and "host" in route["match"][0]:
                    if domain not in route["match"][0]["host"]:
                        new_routes.append(route)
                else:
                    new_routes.append(route)

            # Update routes
            update_response = requests.put(
                f"{self.api_url}/config/apps/http/servers/srv0/routes",
                headers=self.headers,
                data=json.dumps(new_routes),
            )

            if update_response.status_code != 200:
                logger.error(
                    f"Failed to update routes: {update_response.status_code} - {update_response.text}"
                )
                return False

            # Remove domain from TLS subjects
            tls_response = requests.get(
                f"{self.api_url}/config/apps/tls/automation/policies/0/subjects"
            )
            if tls_response.status_code == 200:
                subjects = tls_response.json()
                if domain in subjects:
                    subjects.remove(domain)
                    tls_update = requests.patch(
                        f"{self.api_url}/config/apps/tls/automation/policies/0/subjects",
                        headers=self.headers,
                        data=json.dumps(subjects),
                    )
                    if tls_update.status_code != 200:
                        logger.error(
                            f"Failed to remove {domain} from TLS subjects: {tls_update.status_code} - {tls_update.text}"
                        )
                        return False
            else:
                logger.error(
                    f"Failed to get TLS subjects: {tls_response.status_code} - {tls_response.text}"
                )
                return False

            logger.info(
                f"Successfully removed domain {domain} from Caddy configuration"
            )
            return True

        except Exception as e:
            logger.error(f"Error removing domain {domain}: {str(e)}")
            return False
