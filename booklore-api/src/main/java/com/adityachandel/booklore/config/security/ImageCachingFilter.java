package com.adityachandel.booklore.config.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpHeaders;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
public class ImageCachingFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
        if (request.getRequestURI().startsWith("/api/v1/books") && request.getRequestURI().contains("/cover")) {
            response.setHeader(HttpHeaders.CACHE_CONTROL, "public, max-age=3600");
            response.setHeader(HttpHeaders.EXPIRES, String.valueOf(System.currentTimeMillis() + 3600000));
        }
        filterChain.doFilter(request, response);
    }
}
