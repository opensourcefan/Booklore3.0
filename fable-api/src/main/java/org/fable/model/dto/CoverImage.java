package org.fable.model.dto;

import lombok.Value;

@Value
public class CoverImage {
    String url;
    int width;
    int height;
    int index;
}
