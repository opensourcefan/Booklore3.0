package org.fable.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.fable.config.security.service.AuthenticationService;
import org.fable.exception.APIException;
import org.fable.mapper.KoreaderUserMapper;
import org.fable.model.dto.FableUser;
import org.fable.model.dto.KoreaderUser;
import org.fable.model.entity.FableUserEntity;
import org.fable.model.entity.KoreaderUserEntity;
import org.fable.repository.KoreaderUserRepository;
import org.fable.repository.UserRepository;
import org.fable.service.koreader.KoreaderUserService;
import org.fable.util.Md5Util;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.Optional;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class KoreaderUserServiceTest {

    @Mock AuthenticationService authService;
    @Mock UserRepository userRepository;
    @Mock KoreaderUserRepository koreaderUserRepository;
    @Mock KoreaderUserMapper koreaderUserMapper;
    @InjectMocks
    KoreaderUserService service;

    private FableUserEntity ownerEntity;
    private KoreaderUserEntity entity;
    private KoreaderUser dto;

    @BeforeEach
    void init() {
        FableUser ownerDto = mock(FableUser.class);
        when(ownerDto.getId()).thenReturn(123L);
        when(ownerDto.getUsername()).thenReturn("ownerName");
        when(authService.getAuthenticatedUser()).thenReturn(ownerDto);

        ownerEntity = new FableUserEntity();
        ownerEntity.setId(123L);
        ownerEntity.setUsername("ownerName");

        entity = new KoreaderUserEntity();
        entity.setId(10L);
        entity.setFableUser(ownerEntity);
        entity.setUsername("kvUser");

        dto = new KoreaderUser(10L, "kvUser", null, null, false, true);
        when(koreaderUserMapper.toDto(any(KoreaderUserEntity.class))).thenReturn(dto);
    }

    @Test
    void upsertUser_createsNew_whenAbsent() {
        when(userRepository.findById(123L)).thenReturn(Optional.of(ownerEntity));
        when(koreaderUserRepository.findByFableUserId(123L)).thenReturn(Optional.empty());
        when(koreaderUserRepository.save(any(KoreaderUserEntity.class))).thenAnswer(invocation -> {
            KoreaderUserEntity arg = invocation.getArgument(0);
            arg.setId(42L);
            return arg;
        });

        when(koreaderUserMapper.toDto(any(KoreaderUserEntity.class))).thenAnswer(invocation -> {
            KoreaderUserEntity u = invocation.getArgument(0);
            return new KoreaderUser(u.getId(), u.getUsername(), u.getPassword(), u.getPasswordMD5(), u.isSyncEnabled(), u.isSyncWithFableReader());
        });

        KoreaderUser result = service.upsertUser("userA", "passA");

        assertEquals(42L, result.getId());
        assertEquals("userA", result.getUsername());
        verify(koreaderUserRepository).save(argThat(u ->
            u.getFableUser() == ownerEntity &&
            u.getUsername().equals("userA") &&
            u.getPasswordMD5().equals(Md5Util.md5Hex("passA"))
        ));
    }

    @Test
    void upsertUser_updatesExisting_whenPresent() {
        when(userRepository.findById(123L)).thenReturn(Optional.of(ownerEntity));
        when(koreaderUserRepository.findByFableUserId(123L)).thenReturn(Optional.of(entity));
        when(koreaderUserRepository.save(entity)).thenReturn(entity);

        KoreaderUser result = service.upsertUser("newName", "newPass");

        assertEquals(dto, result);
        verify(koreaderUserRepository).save(entity);
        assertEquals("newName", entity.getUsername());
        assertEquals(Md5Util.md5Hex("newPass"), entity.getPasswordMD5());
    }

    @Test
    void upsertUser_throws_whenOwnerMissing() {
        when(userRepository.findById(123L)).thenReturn(Optional.empty());
        assertThrows(APIException.class,
                     () -> service.upsertUser("x", "y"));
    }

    @Test
    void getUser_returnsDto_whenFound() {
        when(koreaderUserRepository.findByFableUserId(123L)).thenReturn(Optional.of(entity));
        KoreaderUser result = service.getUser();
        assertEquals(dto, result);
    }

    @Test
    void getUser_throws_whenNotFound() {
        when(koreaderUserRepository.findByFableUserId(123L)).thenReturn(Optional.empty());
        assertThrows(APIException.class, () -> service.getUser());
    }

    @Test
    void toggleSync_setsFlag_andSaves() {
        when(koreaderUserRepository.findByFableUserId(123L)).thenReturn(Optional.of(entity));
        service.toggleSync(true);
        assertTrue(entity.isSyncEnabled());
        verify(koreaderUserRepository).save(entity);
    }

    @Test
    void toggleSync_throws_whenEntityMissing() {
        when(koreaderUserRepository.findByFableUserId(123L)).thenReturn(Optional.empty());
        assertThrows(APIException.class, () -> service.toggleSync(false));
    }
}
