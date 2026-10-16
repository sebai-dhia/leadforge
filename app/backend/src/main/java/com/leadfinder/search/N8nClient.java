package com.leadfinder.search;

import com.leadfinder.config.AppProperties;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;

@Component
public class N8nClient {
    private final AppProperties props;
    private final RestClient http;

    public N8nClient(AppProperties props) {
        this.props = props;
        // HTTP/1.1 only: the JDK client's default h2c upgrade makes POSTs to n8n hang.
        HttpClient jdk = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(5))
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(jdk);
        factory.setReadTimeout(Duration.ofSeconds(15));
        this.http = RestClient.builder().requestFactory(factory).build();
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
