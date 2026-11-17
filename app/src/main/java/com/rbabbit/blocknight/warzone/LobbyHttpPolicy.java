package com.rbabbit.blocknight.warzone;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Small transport policy shared by the real bridge and its host checks. */
final class LobbyHttpPolicy {
  static final int MAX_BYTES = 4 * 1024 * 1024;
  static final int DEADLINE_MS = 20_000;
  static final String HOST = "wzlobby.wz2100.net";
  static final String USER_AGENT = "Warzone2100/4.7.0 (+https://github.com/Warzone2100/warzone2100)";

  private LobbyHttpPolicy() { }

  static URI allowedUrl(String value) throws IOException {
    try {
      URI uri = new URI(value);
      if (!"https".equalsIgnoreCase(uri.getScheme()) || !HOST.equalsIgnoreCase(uri.getHost())
          || (uri.getPort() != -1 && uri.getPort() != 443) || uri.getRawUserInfo() != null
          || uri.getRawFragment() != null) throw new IOException("Only the official HTTPS lobby is allowed");
      return uri;
    } catch (URISyntaxException | NullPointerException invalid) {
      throw new IOException("Invalid lobby URL", invalid);
    }
  }

  static String method(String supplied) throws IOException {
    String method = supplied == null ? "GET" : supplied.toUpperCase(Locale.ROOT);
    if (!method.matches("GET|HEAD|POST|PUT|DELETE|OPTIONS|PATCH")) throw new IOException("Unsupported HTTP method");
    return method;
  }

  static boolean forwardedHeader(String name, String value) throws IOException {
    if (name == null || value == null || !name.matches("[!#$%&'*+.^_`|~0-9A-Za-z-]+")
        || value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0 || value.indexOf('\0') >= 0)
      throw new IOException("Invalid HTTP header");
    return !name.equalsIgnoreCase("Host") && !name.equalsIgnoreCase("Content-Length")
        && !name.equalsIgnoreCase("Connection");
  }

  static void bodyAllowed(String method, int bytes) throws IOException {
    if (bytes > MAX_BYTES) throw new IOException("Lobby request exceeds size limit");
    if (bytes > 0 && (method.equals("GET") || method.equals("HEAD")))
      throw new IOException("HTTP method does not permit a request body");
  }

  /** Identities survive until UI delivery; canceled/retired callbacks cannot claim a reused id. */
  static final class Registry {
    static final class Ticket {
      final int id;
      private boolean terminal;
      Ticket(int id) { this.id = id; }
    }
    private final Map<Integer, Ticket> current = new HashMap<>();

    synchronized Ticket begin(int id) {
      Ticket previous = current.get(id);
      if (id < 0 || (previous != null && !previous.terminal)
          || (previous == null && current.size() >= 8)) return null;
      Ticket ticket = new Ticket(id);
      current.put(id, ticket);
      return ticket;
    }
    synchronized boolean isCurrent(Ticket ticket) { return current.get(ticket.id) == ticket; }
    synchronized boolean active(Ticket ticket) { return isCurrent(ticket) && !ticket.terminal; }
    synchronized boolean terminal(Ticket ticket) {
      if (!isCurrent(ticket) || ticket.terminal) return false;
      ticket.terminal = true;
      return true;
    }
    synchronized boolean claim(Ticket ticket) {
      if (!isCurrent(ticket) || !ticket.terminal) return false;
      current.remove(ticket.id);
      return true;
    }
    synchronized Ticket cancel(int id) { return current.remove(id); }
    synchronized List<Ticket> clear() {
      List<Ticket> tickets = new ArrayList<>(current.values());
      current.clear();
      return tickets;
    }
  }
}
