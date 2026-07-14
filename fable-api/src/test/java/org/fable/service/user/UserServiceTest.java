package org.fable.service.user;

import org.fable.config.security.service.AuthenticationService;
import org.fable.mapper.custom.FableUserTransformer;
import org.fable.model.dto.FableUser;
import org.fable.model.dto.request.ChangeUserPasswordRequest;
import org.fable.model.dto.request.UserUpdateRequest;
import org.fable.model.entity.FableUserEntity;
import org.fable.model.entity.UserPermissionsEntity;
import org.fable.repository.LibraryRepository;
import org.fable.repository.UserRepository;
import org.fable.service.audit.AuditService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import tools.jackson.databind.ObjectMapper;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;
    @Mock
    private LibraryRepository libraryRepository;
    @Mock
    private AuthenticationService authenticationService;
    @Mock
    private PasswordEncoder passwordEncoder;
    @Mock
    private ObjectMapper objectMapper;
    @Mock
    private FableUserTransformer fableUserTransformer;
    @Mock
    private AuditService auditService;

    @InjectMocks
    private UserService userService;

    @Test
    void changeUserPassword_reArmsDefaultPasswordFlag() {
        FableUserEntity user = FableUserEntity.builder()
                .id(5L)
                .username("guest")
                .isDefaultPassword(false)
                .passwordHash("old-hash")
                .build();
        when(userRepository.findById(5L)).thenReturn(Optional.of(user));
        when(passwordEncoder.encode("TempPass12")).thenReturn("new-hash");

        ChangeUserPasswordRequest request = new ChangeUserPasswordRequest();
        request.setUserId(5L);
        request.setNewPassword("TempPass12");

        userService.changeUserPassword(request);

        ArgumentCaptor<FableUserEntity> captor = ArgumentCaptor.forClass(FableUserEntity.class);
        verify(userRepository).save(captor.capture());
        assertThat(captor.getValue().isDefaultPassword()).isTrue();
        assertThat(captor.getValue().getPasswordHash()).isEqualTo("new-hash");
    }

    @Test
    void updateUser_changesUsernameWhenAvailable() {
        UserPermissionsEntity perms = new UserPermissionsEntity();
        perms.setPermissionAdmin(false);
        FableUserEntity user = FableUserEntity.builder()
                .id(3L)
                .username("tempuser")
                .name("Reader")
                .email("r@example.com")
                .permissions(perms)
                .isDefaultPassword(false)
                .build();
        when(userRepository.findById(3L)).thenReturn(Optional.of(user));
        when(userRepository.findByUsername("alice")).thenReturn(Optional.empty());

        FableUser.UserPermissions actorPerms = new FableUser.UserPermissions();
        actorPerms.setAdmin(false);
        when(authenticationService.getAuthenticatedUser()).thenReturn(
                FableUser.builder().id(3L).permissions(actorPerms).build());
        when(fableUserTransformer.toDTO(any())).thenAnswer(inv -> {
            FableUserEntity e = inv.getArgument(0);
            return FableUser.builder().id(e.getId()).username(e.getUsername()).name(e.getName()).email(e.getEmail()).build();
        });

        UserUpdateRequest update = new UserUpdateRequest();
        update.setUsername("alice");
        update.setName("Reader");
        update.setEmail("r@example.com");

        FableUser result = userService.updateUser(3L, update);

        assertThat(result.getUsername()).isEqualTo("alice");
        assertThat(user.getUsername()).isEqualTo("alice");
    }

    @Test
    void updateUser_rejectsTakenUsername() {
        UserPermissionsEntity perms = new UserPermissionsEntity();
        perms.setPermissionAdmin(false);
        FableUserEntity user = FableUserEntity.builder()
                .id(3L)
                .username("tempuser")
                .name("Reader")
                .permissions(perms)
                .isDefaultPassword(false)
                .build();
        when(userRepository.findById(3L)).thenReturn(Optional.of(user));
        when(userRepository.findByUsername("taken")).thenReturn(Optional.of(
                FableUserEntity.builder().id(9L).username("taken").isDefaultPassword(false).build()));

        FableUser.UserPermissions actorPerms = new FableUser.UserPermissions();
        actorPerms.setAdmin(false);
        when(authenticationService.getAuthenticatedUser()).thenReturn(
                FableUser.builder().id(3L).permissions(actorPerms).build());

        UserUpdateRequest update = new UserUpdateRequest();
        update.setUsername("taken");

        org.junit.jupiter.api.Assertions.assertThrows(
                org.fable.exception.APIException.class,
                () -> userService.updateUser(3L, update));
    }

    @Test
    void updateUser_selfCanClearEmailToNull() {
        UserPermissionsEntity perms = new UserPermissionsEntity();
        perms.setPermissionAdmin(false);
        FableUserEntity user = FableUserEntity.builder()
                .id(3L)
                .username("reader")
                .name("Reader")
                .email("old@example.com")
                .permissions(perms)
                .isDefaultPassword(false)
                .build();
        when(userRepository.findById(3L)).thenReturn(Optional.of(user));

        FableUser.UserPermissions actorPerms = new FableUser.UserPermissions();
        actorPerms.setAdmin(false);
        when(authenticationService.getAuthenticatedUser()).thenReturn(
                FableUser.builder().id(3L).permissions(actorPerms).build());
        when(fableUserTransformer.toDTO(any())).thenAnswer(inv -> {
            FableUserEntity e = inv.getArgument(0);
            return FableUser.builder().id(e.getId()).name(e.getName()).email(e.getEmail()).build();
        });

        UserUpdateRequest update = new UserUpdateRequest();
        update.setName("Reader");
        update.setEmail("   ");

        FableUser result = userService.updateUser(3L, update);

        assertThat(result.getEmail()).isNull();
        verify(userRepository).save(user);
        assertThat(user.getEmail()).isNull();
    }
}
