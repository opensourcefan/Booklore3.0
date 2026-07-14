package org.fable.service.user;

import lombok.RequiredArgsConstructor;
import org.fable.config.security.service.AuthenticationService;
import org.fable.exception.ApiError;
import org.fable.mapper.custom.FableUserTransformer;
import org.fable.model.dto.FableUser;
import org.fable.model.dto.request.ChangePasswordRequest;
import org.fable.model.dto.request.ChangeUserPasswordRequest;
import org.fable.model.dto.request.UpdateUserSettingRequest;
import org.fable.model.dto.request.UserUpdateRequest;
import org.fable.model.dto.settings.UserSettingKey;
import org.fable.model.entity.FableUserEntity;
import org.fable.model.entity.LibraryEntity;
import org.fable.model.entity.UserSettingEntity;
import org.fable.model.enums.UserPermission;
import org.fable.repository.LibraryRepository;
import org.fable.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.stream.Collectors;
import org.fable.model.enums.AuditAction;
import org.fable.service.audit.AuditService;
import org.fable.service.library.PersonalLibraryService;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final LibraryRepository libraryRepository;
    private final AuthenticationService authenticationService;
    private final PasswordEncoder passwordEncoder;
    private final ObjectMapper objectMapper;
    private final FableUserTransformer fableUserTransformer;
    private final AuditService auditService;
    private final PersonalLibraryService personalLibraryService;

    public List<FableUser> getFableUsers() {
        return userRepository.findAll()
                .stream()
                .map(fableUserTransformer::toDTO)
                .collect(Collectors.toList());
    }

    public FableUser updateUser(Long id, UserUpdateRequest updateRequest) {
        FableUserEntity user = userRepository.findById(id).orElseThrow(() -> ApiError.USER_NOT_FOUND.createException(id));
        FableUser actor = getMyself();
        boolean actorIsAdmin = actor.getPermissions().isAdmin();

        if (updateRequest.getName() != null) {
            user.setName(updateRequest.getName());
        }
        if (updateRequest.getEmail() != null) {
            String email = updateRequest.getEmail().isBlank() ? null : updateRequest.getEmail().trim();
            user.setEmail(email);
        }
        if (updateRequest.getUsername() != null) {
            applyUsernameChange(user, updateRequest.getUsername());
        }

        if (updateRequest.getPermissions() != null && actorIsAdmin) {
            UserPermission.copyFromRequestToEntity(updateRequest.getPermissions(), user.getPermissions());
            auditService.log(AuditAction.PERMISSIONS_CHANGED, "User", id, "Changed permissions for user: " + user.getUsername());
        }

        if (updateRequest.getAssignedLibraries() != null && actorIsAdmin) {
            List<Long> libraryIds = updateRequest.getAssignedLibraries();
            List<LibraryEntity> updatedLibraries = libraryRepository.findAllById(libraryIds);
            user.setLibraries(updatedLibraries);
        }

        if (updateRequest.getShowLibrary() != null && actorIsAdmin) {
            personalLibraryService.setShowInAdminCatalogForOwner(user.getId(), updateRequest.getShowLibrary());
        }

        userRepository.save(user);
        auditService.log(AuditAction.USER_UPDATED, "User", id, "Updated user: " + user.getUsername());
        return fableUserTransformer.toDTO(user);
    }

    public void deleteUser(Long id) {
        FableUserEntity userToDelete = userRepository.findById(id).orElseThrow(() -> ApiError.USER_NOT_FOUND.createException(id));
        FableUser currentUser = authenticationService.getAuthenticatedUser();
        boolean isAdmin = currentUser.getPermissions().isAdmin();
        if (!isAdmin) {
            throw ApiError.GENERIC_UNAUTHORIZED.createException("You do not have permission to delete this User");
        }
        if (currentUser.getId().equals(userToDelete.getId())) {
            throw ApiError.SELF_DELETION_NOT_ALLOWED.createException();
        }
        userRepository.delete(userToDelete);
        auditService.log(AuditAction.USER_DELETED, "User", id, "Deleted user: " + userToDelete.getUsername());
    }

    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public FableUser getFableUser(Long id) {
        FableUserEntity user = userRepository.findById(id).orElseThrow(() -> ApiError.USER_NOT_FOUND.createException(id));
        return fableUserTransformer.toDTO(user);
    }

    public FableUser getMyself() {
        return authenticationService.getAuthenticatedUser();
    }

    public void changePassword(ChangePasswordRequest changePasswordRequest) {
        FableUser fableUser = authenticationService.getAuthenticatedUser();

        FableUserEntity fableUserEntity = userRepository.findById(fableUser.getId())
                .orElseThrow(() -> ApiError.USER_NOT_FOUND.createException(fableUser.getId()));

        if (fableUserEntity.getPermissions().isPermissionDemoUser()) {
            throw ApiError.DEMO_USER_PASSWORD_CHANGE_NOT_ALLOWED.createException();
        }

        if (!passwordEncoder.matches(changePasswordRequest.getCurrentPassword(), fableUserEntity.getPasswordHash())) {
            throw ApiError.PASSWORD_INCORRECT.createException();
        }

        if (passwordEncoder.matches(changePasswordRequest.getNewPassword(), fableUserEntity.getPasswordHash())) {
            throw ApiError.PASSWORD_SAME_AS_CURRENT.createException();
        }

        if (!meetsMinimumPasswordRequirements(changePasswordRequest.getNewPassword())) {
            throw ApiError.PASSWORD_TOO_SHORT.createException();
        }

        if (changePasswordRequest.getNewUsername() != null && !changePasswordRequest.getNewUsername().isBlank()) {
            applyUsernameChange(fableUserEntity, changePasswordRequest.getNewUsername());
        }

        fableUserEntity.setDefaultPassword(false);
        fableUserEntity.setPasswordHash(passwordEncoder.encode(changePasswordRequest.getNewPassword()));
        userRepository.save(fableUserEntity);
        auditService.log(AuditAction.PASSWORD_CHANGED, "User", fableUser.getId(), "Password changed by user: " + fableUserEntity.getUsername());
    }

    public void changeUserPassword(ChangeUserPasswordRequest request) {
        FableUserEntity userEntity = userRepository.findById(request.getUserId()).orElseThrow(() -> ApiError.USER_NOT_FOUND.createException(request.getUserId()));
        if (!meetsMinimumPasswordRequirements(request.getNewPassword())) {
            throw ApiError.PASSWORD_TOO_SHORT.createException();
        }
        userEntity.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        // Force the user through /change-password on next login (in-house temp-password handoff).
        userEntity.setDefaultPassword(true);
        userRepository.save(userEntity);
        auditService.log(AuditAction.PASSWORD_CHANGED, "User", request.getUserId(), "Password changed for user: " + userEntity.getUsername());
    }

    public void updateUserSetting(Long userId, UpdateUserSettingRequest request) {
        FableUserEntity user = userRepository.findById(userId).orElseThrow(() -> ApiError.USER_NOT_FOUND.createException(userId));

        String key = request.getKey();
        Object value = request.getValue();

        if (key == null || key.isBlank()) {
            throw ApiError.INVALID_INPUT.createException("Setting key cannot be null or blank.");
        }

        UserSettingKey settingKey;
        try {
            settingKey = UserSettingKey.fromDbKey(key);
        } catch (IllegalArgumentException e) {
            throw ApiError.INVALID_INPUT.createException("Unknown setting key: " + key);
        }

        UserSettingEntity setting = user.getSettings().stream()
                .filter(s -> s.getSettingKey().equals(key))
                .findFirst()
                .orElseGet(() -> {
                    UserSettingEntity newSetting = new UserSettingEntity();
                    newSetting.setUser(user);
                    newSetting.setSettingKey(key);
                    user.getSettings().add(newSetting);
                    return newSetting;
                });

        try {
            String serializedValue;
            if (settingKey.isJson()) {
                serializedValue = objectMapper.writeValueAsString(value);
            } else {
                serializedValue = value.toString();
            }
            setting.setSettingValue(serializedValue);
        } catch (Exception e) {
            throw ApiError.INVALID_INPUT.createException("Could not serialize setting value.");
        }

        userRepository.save(user);
    }

    private boolean meetsMinimumPasswordRequirements(String password) {
        return password != null && password.length() >= 8;
    }

    private void applyUsernameChange(FableUserEntity user, String rawUsername) {
        String newUsername = rawUsername == null ? "" : rawUsername.trim();
        if (newUsername.isBlank()) {
            throw ApiError.INVALID_INPUT.createException("Username cannot be blank.");
        }
        if (newUsername.equals(user.getUsername())) {
            return;
        }
        if (userRepository.findByUsername(newUsername).isPresent()) {
            throw ApiError.USERNAME_ALREADY_TAKEN.createException(newUsername);
        }
        String previous = user.getUsername();
        user.setUsername(newUsername);
        auditService.log(AuditAction.USER_UPDATED, "User", user.getId(),
                "Username changed from " + previous + " to " + newUsername);
    }
}
