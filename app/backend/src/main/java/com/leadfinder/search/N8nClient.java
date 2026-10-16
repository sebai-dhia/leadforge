package com.leadfinder.search;

import com.leadfinder.config.AppProperties;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;

@Component
public class N8nClient {
    private final AppProperties props;
    private final RestClient http = RestClient.create();

    public N8nClient(AppProperties props) {
        this.props = props;
    }

    /** n8n answers immediately (Webhook responds "When received") and calls back when finished. */
    public void trigger(SearchJob job) {
        http.post()
                .uri(props.n8n().webhookUrl())
                .header("X-Webhook-Secret", props.n8n().webhookSecret())
                .body(Map.of(
                        "jobId", job.getId(),
                        "niche", job.getNiche(),
                        "city", job.getCity(),
                        "service", job.getService(),
                        "sender", job.getSender(),
                        "callbackUrl", props.publicBaseUrl() + "/api/internal/n8n/results"))
                .retrieve()
                .toBodilessEntity();
    }
}
