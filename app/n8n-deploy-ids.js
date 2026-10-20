// n8n ids the generated workflows need: workflow ids (so an import updates the live workflow), credential ids and
// webhook ids. These are references, not secrets: the keys themselves stay encrypted inside n8n.
// After creating a credential in a new n8n, put its id here.
const DEPLOY = {
  "Lead Finder Backend": {
    "id": "8ACMtHmOlXSVmmGx",
    "settings": {
      "executionOrder": "v1"
    },
    "nodes": {
      "Webhook": {
        "credentials": {
          "httpHeaderAuth": {
            "id": "YGPCoaeGLueDfqve",
            "name": "Header Auth account"
          }
        },
        "webhookId": "find-leads-backend"
      },
      "Geocode City": {
        "credentials": {
          "httpQueryAuth": {
            "id": "rGQixT3tQRwDkkSx",
            "name": "Query Auth account"
          }
        }
      },
      "Geoapify Places": {
        "credentials": {
          "httpQueryAuth": {
            "id": "rGQixT3tQRwDkkSx",
            "name": "Query Auth account"
          }
        }
      },
      "Maps Search": {
        "credentials": {
          "httpHeaderAuth": {
            "id": "cU0NuC0Q0GMMLVkw",
            "name": "Header Auth account 7"
          }
        }
      },
      "Web Search": {
        "credentials": {
          "httpHeaderAuth": {
            "id": "cU0NuC0Q0GMMLVkw",
            "name": "Header Auth account 7"
          }
        }
      },
      "AI Check": {
        "credentials": {
          "httpHeaderAuth": {
            "id": "zl08YnKaBcKVRKg0",
            "name": "Header Auth account 6"
          }
        }
      },
      "Send Results to Backend": {
        "credentials": {
          "httpHeaderAuth": {
            "id": "qKkJSgmCjRN1FSKZ",
            "name": "Header Auth account 2"
          }
        }
      },
      "Telegram Alert": {
        "credentials": {
          "telegramApi": {
            "id": "MF2BrWxZhkIxsVfR",
            "name": "Telegram account"
          }
        }
      }
    }
  },
  "Lead Finder Draft Message": {
    "id": "P3XODMGxV9yOHjNG",
    "settings": {
      "executionOrder": "v1"
    },
    "nodes": {
      "Webhook": {
        "credentials": {
          "httpHeaderAuth": {
            "id": "YGPCoaeGLueDfqve",
            "name": "Header Auth account"
          }
        },
        "webhookId": "draft-message-backend"
      },
      "AI Write Message": {
        "credentials": {
          "httpHeaderAuth": {
            "id": "zl08YnKaBcKVRKg0",
            "name": "Header Auth account 6"
          }
        }
      },
      "AI Retry": {
        "credentials": {
          "httpHeaderAuth": {
            "id": "zl08YnKaBcKVRKg0",
            "name": "Header Auth account 6"
          }
        }
      }
    }
  },
  "Lead Finder Enrich Contact": {
    "id": "utUwMpTrpnqQ6A4R",
    "settings": {
      "executionOrder": "v1",
      "binaryMode": "separate"
    },
    "nodes": {
      "Webhook": {
        "credentials": {
          "httpHeaderAuth": {
            "id": "YGPCoaeGLueDfqve",
            "name": "Header Auth account"
          }
        },
        "webhookId": "enrich-contact-backend"
      },
      "Serper Search": {
        "credentials": {
          "httpHeaderAuth": {
            "id": "cU0NuC0Q0GMMLVkw",
            "name": "Header Auth account 7"
          }
        }
      }
    }
  }
};

/** Adds the ids to a workflow built by build-*.js. A credential set on a node by the builder wins. */
function withDeployIds(workflow) {
  const d = DEPLOY[workflow.name];
  if (!d) throw new Error('No deploy ids for ' + workflow.name);
  workflow.id = d.id;
  workflow.settings = { ...d.settings, ...(workflow.settings || {}) };
  for (const node of workflow.nodes) {
    const n = d.nodes[node.name];
    if (!n) continue;
    if (n.credentials && !node.credentials) node.credentials = n.credentials;
    if (n.webhookId) node.webhookId = n.webhookId;
  }
  return workflow;
}

module.exports = { withDeployIds };
