---
type: snippet
tags: [spring-boot, rest, exception-handler, java, error-dto]
updated: 2026-01-01
---

# REST Error Handler — Spring Boot

Padrão de arquitetura hexagonal para APIs REST Spring Boot.
Cobre os três casos de erro mais comuns: input inválido (400),
recurso não encontrado (404) e erro genérico de servidor (500).

## Uso

Copie `ErrorResponse` e `GlobalExceptionHandler` para o pacote
`adapter.in.web.exception` do seu módulo Spring Boot. Não é necessário
nenhuma dependência adicional além do `spring-boot-starter-web`.

```java
// ErrorResponse.java
package com.example.adapter.in.web.exception;

import java.time.Instant;

public record ErrorResponse(
    Instant timestamp,
    int status,
    String error,
    String message,
    String path
) {
    public static ErrorResponse of(int status, String error, String message, String path) {
        return new ErrorResponse(Instant.now(), status, error, message, path);
    }
}
```

```java
// GlobalExceptionHandler.java
package com.example.adapter.in.web.exception;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleBadRequest(
            IllegalArgumentException ex, HttpServletRequest req) {
        return ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(ErrorResponse.of(400, "Bad Request", ex.getMessage(), req.getRequestURI()));
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(
            NoSuchElementException ex, HttpServletRequest req) {
        return ResponseEntity
            .status(HttpStatus.NOT_FOUND)
            .body(ErrorResponse.of(404, "Not Found", ex.getMessage(), req.getRequestURI()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneric(
            Exception ex, HttpServletRequest req) {
        return ResponseEntity
            .status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(ErrorResponse.of(500, "Internal Server Error", "Unexpected error", req.getRequestURI()));
    }
}
```
