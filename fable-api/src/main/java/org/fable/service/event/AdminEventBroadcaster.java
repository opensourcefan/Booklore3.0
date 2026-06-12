package org.fable.service.event;

import org.fable.model.dto.FableUser;
import org.fable.model.websocket.LogNotification;
import org.fable.model.websocket.Topic;
import org.fable.service.user.UserService;
import lombok.AllArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.List;

@AllArgsConstructor
@Service
public class AdminEventBroadcaster {

    private final SimpMessagingTemplate messagingTemplate;
    private final UserService userService;

    public void broadcastAdminEvent(String message) {
        List<FableUser> admins = userService.getFableUsers().stream()
                .filter(u -> u.getPermissions().isAdmin())
                .toList();
        for (FableUser admin : admins) {
            messagingTemplate.convertAndSendToUser(admin.getUsername(), Topic.LOG.getPath(), LogNotification.info(message));
        }
    }
}
