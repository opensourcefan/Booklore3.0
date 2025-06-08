package com.adityachandel.booklore.convertor;

import com.adityachandel.booklore.model.dto.BookRecommendationLite;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.List;
import java.util.Set;

@Converter
public class BookRecommendationIdsListConverter implements AttributeConverter<Set<BookRecommendationLite>, String> {

    private static final ObjectMapper objectMapper = new ObjectMapper();

    static {
        objectMapper.registerModule(new JavaTimeModule());
    }

    @Override
    public String convertToDatabaseColumn(Set<BookRecommendationLite> recommendations) {
        try {
            return objectMapper.writeValueAsString(recommendations);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Error converting BookRecommendation list to JSON", e);
        }
    }

    @Override
    public Set<BookRecommendationLite> convertToEntityAttribute(String json) {
        if (json == null || json.trim().isEmpty()) {
            return Set.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<Set<BookRecommendationLite>>() {
            });
        } catch (Exception e) {
            throw new RuntimeException("Error converting JSON to BookRecommendation list", e);
        }
    }
}
