package org.fable.util;

import lombok.experimental.UtilityClass;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

@UtilityClass
public class Md5Util {

    public String md5Hex(String input) {
        if (input == null) {
            return null;
        }
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException(e);
        }
    }

    public boolean constantTimeEqualsHex(String expectedHex, String providedHex) {
        if (expectedHex == null || providedHex == null) {
            return false;
        }

        byte[] expectedBytes = decodeHex(expectedHex);
        byte[] providedBytes = decodeHex(providedHex);
        if (expectedBytes == null || providedBytes == null) {
            return false;
        }

        return MessageDigest.isEqual(expectedBytes, providedBytes);
    }

    private byte[] decodeHex(String hex) {
        if ((hex.length() & 1) != 0) {
            return null;
        }

        byte[] bytes = new byte[hex.length() / 2];
        for (int index = 0; index < hex.length(); index += 2) {
            int high = Character.digit(hex.charAt(index), 16);
            int low = Character.digit(hex.charAt(index + 1), 16);
            if (high < 0 || low < 0) {
                return null;
            }
            bytes[index / 2] = (byte) ((high << 4) + low);
        }

        return bytes;
    }
}
