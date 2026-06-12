package org.fable.service.koreader;

import org.fable.config.security.service.AuthenticationService;
import org.fable.exception.ApiError;
import org.fable.mapper.KoreaderUserMapper;
import org.fable.model.dto.KoreaderUser;
import org.fable.model.entity.FableUserEntity;
import org.fable.model.entity.KoreaderUserEntity;
import org.fable.repository.KoreaderUserRepository;
import org.fable.repository.UserRepository;
import org.fable.util.Md5Util;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class KoreaderUserService {

    private final AuthenticationService authService;
    private final UserRepository userRepository;
    private final KoreaderUserRepository koreaderUserRepository;
    private final KoreaderUserMapper koreaderUserMapper;

    @Transactional
    public KoreaderUser upsertUser(String username, String rawPassword) {
        Long ownerId = authService.getAuthenticatedUser().getId();
        FableUserEntity owner = userRepository.findById(ownerId)
                .orElseThrow(() -> ApiError.USER_NOT_FOUND.createException(ownerId));

        String md5Password = Md5Util.md5Hex(rawPassword);
        Optional<KoreaderUserEntity> existing = koreaderUserRepository.findByFableUserId(ownerId);
        boolean isUpdate = existing.isPresent();
        KoreaderUserEntity user = existing.orElseGet(() -> {
            KoreaderUserEntity u = new KoreaderUserEntity();
            u.setFableUser(owner);
            return u;
        });

        user.setUsername(username);
        user.setPassword(rawPassword);
        user.setPasswordMD5(md5Password);
        KoreaderUserEntity saved = koreaderUserRepository.save(user);

        log.info("upsertUser: {} KoreaderUser [id={}, username='{}'] for FableUser='{}'",
                isUpdate ? "Updated" : "Created",
                saved.getId(), saved.getUsername(),
                authService.getAuthenticatedUser().getUsername());

        return koreaderUserMapper.toDto(saved);
    }

    public KoreaderUser getUser() {
        Long id = authService.getAuthenticatedUser().getId();
        KoreaderUserEntity user = koreaderUserRepository.findByFableUserId(id)
                .orElseThrow(() -> ApiError.GENERIC_NOT_FOUND.createException("Koreader user not found for Fable user ID: " + id));
        return koreaderUserMapper.toDto(user);
    }

    public void toggleSync(boolean enabled) {
        Long id = authService.getAuthenticatedUser().getId();
        KoreaderUserEntity user = koreaderUserRepository.findByFableUserId(id)
                .orElseThrow(() -> ApiError.GENERIC_NOT_FOUND.createException("Koreader user not found for Fable user ID: " + id));
        user.setSyncEnabled(enabled);
        koreaderUserRepository.save(user);
    }

    public void toggleSyncProgressWithFable(boolean enabled) {
        Long id = authService.getAuthenticatedUser().getId();
        KoreaderUserEntity user = koreaderUserRepository.findByFableUserId(id)
                .orElseThrow(() -> ApiError.GENERIC_NOT_FOUND.createException("Koreader user not found for Fable user ID: " + id));
        user.setSyncWithFableReader(enabled);
        koreaderUserRepository.save(user);
    }
}