package org.fable.service.opds;

import org.fable.config.security.service.AuthenticationService;
import org.fable.mapper.OpdsUserV2Mapper;
import org.fable.model.dto.FableUser;
import org.fable.model.dto.OpdsUserV2;
import org.fable.model.dto.request.OpdsUserV2CreateRequest;
import org.fable.model.dto.request.OpdsUserV2UpdateRequest;
import org.fable.model.entity.FableUserEntity;
import org.fable.model.entity.OpdsUserV2Entity;
import org.fable.model.enums.OpdsSortOrder;
import org.fable.repository.OpdsUserV2Repository;
import org.fable.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.fable.model.enums.AuditAction;
import org.fable.service.audit.AuditService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class OpdsUserV2Service {

    private final OpdsUserV2Repository opdsUserV2Repository;
    private final AuthenticationService authenticationService;
    private final UserRepository userRepository;
    private final OpdsUserV2Mapper mapper;
    private final PasswordEncoder passwordEncoder;
    private final AuditService auditService;


    public List<OpdsUserV2> getOpdsUsers() {
        FableUser fableUser = authenticationService.getAuthenticatedUser();
        List<OpdsUserV2Entity> users = opdsUserV2Repository.findByUserId(fableUser.getId());
        return mapper.toDto(users);
    }

    public OpdsUserV2 createOpdsUser(OpdsUserV2CreateRequest request) {
        try {
            FableUser fableUser = authenticationService.getAuthenticatedUser();
            FableUserEntity userEntity = userRepository.findById(fableUser.getId())
                    .orElseThrow(() -> new UsernameNotFoundException("User not found with ID: " + fableUser.getId()));

            OpdsUserV2Entity opdsUserV2 = OpdsUserV2Entity.builder()
                    .user(userEntity)
                    .username(request.getUsername())
                    .passwordHash(passwordEncoder.encode(request.getPassword()))
                    .sortOrder(request.getSortOrder() != null ? request.getSortOrder() : OpdsSortOrder.RECENT)
                    .build();

            OpdsUserV2 result = mapper.toDto(opdsUserV2Repository.save(opdsUserV2));
            auditService.log(AuditAction.OPDS_USER_CREATED, "OpdsUser", result.getId(), "Created OPDS user: " + request.getUsername());
            return result;
        } catch (DataIntegrityViolationException e) {
            if (e.getMostSpecificCause().getMessage().contains("uq_username")) {
                throw new DataIntegrityViolationException("Username '" + request.getUsername() + "' is already taken");
            }
            throw e;
        }
    }

    public void deleteOpdsUser(Long userId) {
        FableUser fableUser = authenticationService.getAuthenticatedUser();
        OpdsUserV2Entity user = opdsUserV2Repository.findById(userId).orElseThrow(() -> new RuntimeException("User not found with ID: " + userId));
        if (!user.getUser().getId().equals(fableUser.getId())) {
            throw new AccessDeniedException("You are not allowed to delete this user");
        }
        String username = user.getUsername();
        opdsUserV2Repository.delete(user);
        auditService.log(AuditAction.OPDS_USER_DELETED, "OpdsUser", userId, "Deleted OPDS user: " + username);
    }

    public OpdsUserV2 updateOpdsUser(Long userId, OpdsUserV2UpdateRequest request) {
        FableUser fableUser = authenticationService.getAuthenticatedUser();
        OpdsUserV2Entity user = opdsUserV2Repository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found with ID: " + userId));
        
        if (!user.getUser().getId().equals(fableUser.getId())) {
            throw new AccessDeniedException("You are not allowed to update this user");
        }
        
        user.setSortOrder(request.sortOrder());
        OpdsUserV2 result = mapper.toDto(opdsUserV2Repository.save(user));
        auditService.log(AuditAction.OPDS_USER_UPDATED, "OpdsUser", userId, "Updated OPDS user: " + user.getUsername());
        return result;
    }

    public OpdsUserV2Entity findByUsername(String username) {
        return opdsUserV2Repository.findByUsername(username).orElse(null);
    }
}