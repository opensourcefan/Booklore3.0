package org.booklore.util;

public class MathUtils {

    private MathUtils() {
        // Private constructor to hide implicit public one
    }

    public static int clamp(int value, int min, int max) {
        return Math.min(Math.max(value, min), max);
    }
}
