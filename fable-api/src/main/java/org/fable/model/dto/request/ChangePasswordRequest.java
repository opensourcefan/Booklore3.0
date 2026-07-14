package org.fable.model.dto.request;

import lombok.Data;

@Data
public class ChangePasswordRequest {
    private String currentPassword;
    private String newPassword;
    /** Optional preferred username chosen during forced first-login password change. */
    private String newUsername;
}
