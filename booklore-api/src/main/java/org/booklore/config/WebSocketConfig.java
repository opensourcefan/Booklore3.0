package org.booklore.config;

import org.booklore.config.security.interceptor.WebSocketAuthInterceptor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import java.util.Arrays;

@Slf4j
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final WebSocketAuthInterceptor webSocketAuthInterceptor;
    private final Environment env;

    public WebSocketConfig(WebSocketAuthInterceptor webSocketAuthInterceptor, Environment env) {
        this.webSocketAuthInterceptor = webSocketAuthInterceptor;
        this.env = env;
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/queue", "/topic");
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        String allowedOriginsStr = env.getProperty("app.cors.allowed-origins", "").trim();
        var endpoint = registry.addEndpoint("/ws");
        if ("*".equals(allowedOriginsStr)) {
            endpoint.setAllowedOriginPatterns("*");
            log.error(
                "WebSocket CSWSH: ALLOWED_ORIGINS=* allows cross-site WebSocket hijacking. " +
                "Set ALLOWED_ORIGINS to your explicit frontend origin (e.g. https://books.example.com)."
            );
        } else if (allowedOriginsStr.isEmpty()) {
            // No explicit origins configured: enforce same-origin check (Spring WebSocket default).
            log.info("WebSocket endpoint registered at /ws (same-origin only — secure default).");
        } else {
            String[] origins = Arrays.stream(allowedOriginsStr.split("\\s*,\\s*"))
                    .filter(s -> !s.isEmpty())
                    .toArray(String[]::new);
            endpoint.setAllowedOriginPatterns(origins);
            log.info("WebSocket endpoint registered at /ws with allowed origins: {}", Arrays.toString(origins));
        }
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(webSocketAuthInterceptor);
    }
}